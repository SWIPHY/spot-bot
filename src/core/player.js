// src/core/player.js
import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  NoSubscriberBehavior,
  AudioPlayerStatus,
  getVoiceConnection,
} from "@discordjs/voice";
import play from "play-dl";
import ytdl from "ytdl-core";
import { logToDiscord } from "../util/logger.js";

/**
 * Construit les headers HTTP si YT_COOKIE est présent (.env)
 */
function youtubeHeaders() {
  const ck = process.env.YT_COOKIE?.trim();
  if (!ck) return null;
  return {
    cookie: ck,
    // UA "normal" (évite certains blocages)
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "accept-language": "fr-FR,fr;q=0.9,en;q=0.8",
  };
}

/**
 * Wrap de log + pas de spam Discord
 */
function safeLog(msg) {
  console.log(msg);
  try { logToDiscord(msg); } catch {}
}

export class GuildPlayer {
  constructor(guild, queue, textChannel) {
    this.guild = guild;
    this.queue = queue;
    this.textChannel = textChannel;

    this.connection = null;
    this.player = createAudioPlayer({
      behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
    });

    this.consecutiveFails = 0;         // anti-boucle globale
    this.MAX_GLOBAL_FAILS = 5;

    this.player.on("stateChange", (oldS, newS) => {
      if (oldS.status !== newS.status) {
        safeLog(`[voice] ${oldS.status} → ${newS.status}`);
      }
      // Quand une piste finit, on passe à la suivante
      if (
        oldS.status !== AudioPlayerStatus.Idle &&
        newS.status === AudioPlayerStatus.Idle
      ) {
        this._playNext().catch(() => {});
      }
    });

    this.player.on("error", (err) => {
      safeLog(`❌ Audio error: ${err?.message || err}`);
      this._playNext().catch(() => {});
    });
  }

  ensureConnection(voiceChannel) {
    if (this.connection && this.connection.joinConfig.channelId === voiceChannel.id) {
      return this.connection;
    }
    try {
      this.connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: this.guild.id,
        adapterCreator: this.guild.voiceAdapterCreator,
        selfDeaf: true,
      });
      this.connection.subscribe(this.player);
      safeLog(`🔌 Joint ${voiceChannel.name}`);
      return this.connection;
    } catch (e) {
      safeLog(`❌ joinVoiceChannel: ${e?.message || e}`);
      throw e;
    }
  }

  /**
   * Ajoute la track + lance si rien ne joue
   */
  async addAndPlay(track, voiceChannel) {
    this.queue.push(track);
    // si rien en cours → on démarre direct
    if (this.player.state.status === AudioPlayerStatus.Idle && this.queue.index === -1) {
      this.queue.index = 0;
      await this._playCurrent(voiceChannel);
      return "started";
    }
    return "queued";
  }

  /**
   * Joue la piste courante (avec retries/fallbacks)
   */
  async _playCurrent(voiceChannel) {
    const cur = this.queue.current;
    if (!cur) return;

    this.ensureConnection(voiceChannel);
    safeLog(`🎶 Now playing: **${cur.title}**`);

    const headers = youtubeHeaders();

    // On limite les retries par piste pour éviter les boucles
    let tries = 0;
    const MAX_TRIES = 3;

    while (tries < MAX_TRIES) {
      try {
        // 1) play-dl normal
        const s1 = await play.stream(cur.url, { quality: 2 });
        const r1 = createAudioResource(s1.stream, {
          inputType: s1.type,
          inlineVolume: false,
        });
        this.player.play(r1);
        this.consecutiveFails = 0;
        return;
      } catch (e) {
        safeLog(`⚠️ stream failed (try ${tries + 1}/${MAX_TRIES}) → ${e?.message || e}`);
      }

      try {
        // 2) play-dl from info (parfois ça passe mieux)
        const info = await play.video_info(cur.url);
        const s2 = await play.stream_from_info(info, { quality: 2 });
        const r2 = createAudioResource(s2.stream, {
          inputType: s2.type,
          inlineVolume: false,
        });
        this.player.play(r2);
        this.consecutiveFails = 0;
        return;
      } catch (e) {
        safeLog(`⚠️ stream_from_info failed (try ${tries + 1}/${MAX_TRIES}) → ${e?.message || e}`);
      }

      try {
        // 3) ytdl-core (avec cookie si dispo)
        const yOpts = {
          filter: "audioonly",
          quality: "highestaudio",
          highWaterMark: 1 << 25, // gros buffer = moins de décrochage
        };
        if (headers) yOpts.requestOptions = { headers };

        const ystream = ytdl(cur.url, yOpts);
        const r3 = createAudioResource(ystream);
        this.player.play(r3);
        safeLog(headers ? `🔁 Fallback ytdl-core utilisé (cookie)` : `🔁 Fallback ytdl-core utilisé (no cookie)`);
        this.consecutiveFails = 0;
        return;
      } catch (e) {
        // Erreurs typiques quand cookie manquant / anti-bot / 410 etc.
        safeLog(`❌ ytdl error: ${e?.message || e}`);
      }

      // 4) dernier essai: on cherche une alternative "audio"
      try {
        const q = `${cur.title} audio`;
        const res = await play.search(q, { limit: 1, source: { youtube: "video" } });
        if (res[0]?.url) {
          const s4 = await play.stream(res[0].url, { quality: 2 });
          const r4 = createAudioResource(s4.stream, { inputType: s4.type });
          this.player.play(r4);
          safeLog(`🔁 Fallback via recherche alternatif`);
          this.consecutiveFails = 0;
          return;
        }
      } catch (e) {
        safeLog(`⚠️ alt search fail: ${e?.message || e}`);
      }

      tries++;
      // petite pause anti-spam (200ms)
      await new Promise(r => setTimeout(r, 200));
    }

    // si on arrive ici: piste injouable → skip
    this.consecutiveFails++;
    safeLog(`❌ Impossible de jouer: ${cur.title} → skip`);
    await this.skip();

    if (this.consecutiveFails >= this.MAX_GLOBAL_FAILS) {
      safeLog(`🚫 Trop d'échecs consécutifs, j'arrête le player pour éviter une boucle.`);
      this.stop();
    }
  }

  async _playNext() {
    if (!this.queue.moveNext()) {
      this.player.stop(true);
      safeLog(`⏹️ File terminée`);
      return;
    }
    const vc = this._getBoundVoiceChannel();
    if (!vc) return;
    await this._playCurrent(vc);
  }

  _getBoundVoiceChannel() {
    const conn = getVoiceConnection(this.guild.id);
    if (!conn) return null;
    const channelId = conn.joinConfig.channelId;
    return this.guild.channels.cache.get(channelId) || null;
  }

  pause() { this.player.pause(true); }
  resume() { this.player.unpause(); }
  stop() {
    try { this.queue.clear?.(); } catch {}
    this.player.stop(true);
    const conn = getVoiceConnection(this.guild.id);
    if (conn) conn.destroy();
  }
  async skip() { this.player.stop(true); }
}
