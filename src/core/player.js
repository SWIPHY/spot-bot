import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  NoSubscriberBehavior,
  getVoiceConnection,
} from "@discordjs/voice";
import ytdl from "ytdl-core";
import play from "play-dl";
import { logToDiscord } from "../util/logger.js";

function ytHeaders() {
  const h = {};
  if (process.env.YT_COOKIE && process.env.YT_COOKIE.trim()) {
    h.cookie = process.env.YT_COOKIE.trim();
    h["user-agent"] =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
    h["accept-language"] = "fr-FR,fr;q=0.9,en;q=0.8";
  }
  return h;
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

    this.player.on("stateChange", (oldS, newS) => {
      if (oldS.status !== newS.status) {
        logToDiscord(`[voice] ${oldS.status} → ${newS.status}`);
      }
      if (
        oldS.status !== AudioPlayerStatus.Idle &&
        newS.status === AudioPlayerStatus.Idle
      ) {
        this._playNext().catch(() => {});
      }
    });

    this.player.on("error", (err) => {
      logToDiscord(`❌ Audio error: ${err?.message || err}`);
      this._playNext().catch(() => {});
    });
  }

  ensureConnection(voiceChannel) {
    if (
      this.connection &&
      this.connection.joinConfig.channelId === voiceChannel.id
    )
      return this.connection;
    this.connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: this.guild.id,
      adapterCreator: this.guild.voiceAdapterCreator,
      selfDeaf: true,
    });
    this.connection.subscribe(this.player);
    logToDiscord(`🔌 Joint ${voiceChannel.name}`);
    return this.connection;
  }

  async addAndPlay(track, voiceChannel) {
    this.queue.push(track);
    if (this.player.state.status === AudioPlayerStatus.Idle && this.queue.index === -1) {
      this.queue.index = 0;
      await this._playCurrent(voiceChannel);
      return "started";
    }
    return "queued";
  }

  async _playCurrent(voiceChannel) {
    const cur = this.queue.current;
    if (!cur) return;

    // Compteur de tentatives pour éviter les boucles
    cur._tries = (cur._tries || 0) + 1;
    if (cur._tries > 3) {
      logToDiscord(`⏭️ Trop d'échecs, on passe: ${cur.title}`);
      await this.skip();
      return;
    }

    this.ensureConnection(voiceChannel);
    logToDiscord(`🎶 Now playing: **${cur.title}**`);

    // 1) PRIORITÉ: ytdl-core + cookie (évite captcha)
    try {
      const ystream = ytdl(cur.url, {
        filter: "audioonly",
        quality: "highestaudio",
        requestOptions: { headers: ytHeaders() },
        highWaterMark: 1 << 25,
      });
      const resource = createAudioResource(ystream);
      this.player.play(resource);
      return;
    } catch (e) {
      logToDiscord(`⚠️ ytdl error: ${e?.message || e}`);
    }

    // 2) Fallback: play-dl direct
    try {
      const stream = await play.stream(cur.url, { quality: 2 });
      const resource = createAudioResource(stream.stream, {
        inputType: stream.type,
      });
      this.player.play(resource);
      return;
    } catch (e) {
      logToDiscord(`⚠️ play.stream error: ${e?.message || e}`);
    }

    // 3) Fallback: rechercher une alternative "audio"
    try {
      const results = await play.search(`${cur.title} audio`, {
        limit: 1,
        source: { youtube: "video" },
      });
      if (results[0]?.url) {
        const ystream = ytdl(results[0].url, {
          filter: "audioonly",
          quality: "highestaudio",
          requestOptions: { headers: ytHeaders() },
          highWaterMark: 1 << 25,
        });
        const resource = createAudioResource(ystream);
        this.player.play(resource);
        logToDiscord(`🔁 Fallback alternative OK`);
        return;
      }
    } catch (e) {
      logToDiscord(`⚠️ alt search error: ${e?.message || e}`);
    }

    // Si tout échoue -> on passe
    logToDiscord(`❌ Impossible de jouer: ${cur.title} — skip`);
    await this.skip();
  }

  async _playNext() {
    if (!this.queue.moveNext()) {
      this.player.stop(true);
      logToDiscord(`⏹️ File terminée`);
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
    this.queue.clear();
    this.player.stop(true);
    const conn = getVoiceConnection(this.guild.id);
    if (conn) conn.destroy();
  }
  async skip() { this.player.stop(true); }
}
