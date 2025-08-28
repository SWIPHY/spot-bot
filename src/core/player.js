import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  NoSubscriberBehavior,
  getVoiceConnection,
} from "@discordjs/voice";
import play from "play-dl";
import ytdl from "ytdl-core";
import { logToDiscord } from "../util/logger.js";

/** Construit des headers YouTube robustes (cookie seul possible) */
function makeYTHeaders() {
  const headers = {
    // UA simple et stable
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    // Évite parfois un blocage régional
    "accept-language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
    origin: "https://www.youtube.com",
    referer: "https://www.youtube.com/",
  };
  // Cookie seul = OK. Le token est optionnel.
  if (process.env.YT_COOKIE && process.env.YT_COOKIE.trim()) {
    headers.cookie = process.env.YT_COOKIE.trim();
  }
  if (process.env.YT_ID_TOKEN && process.env.YT_ID_TOKEN.trim()) {
    headers["x-youtube-identity-token"] = process.env.YT_ID_TOKEN.trim();
  }
  return headers;
}

// anti-boucle: n’autorise que N essais par piste
const MAX_TRY_PER_TRACK = 3;

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
        console.log(`[voice] ${oldS.status} -> ${newS.status}`);
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
      console.error("AudioPlayer error:", err?.message || err);
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
    // marqueur anti-boucle
    track.__tries = 0;
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
    this.ensureConnection(voiceChannel);

    logToDiscord(`🎶 Now playing: **${cur.title}**`);

    // 1) play-dl direct (sans video_info, qui déclenche souvent le challenge)
    try {
      const s = await play.stream(cur.url, { quality: 2 }); // audio high
      this.player.play(createAudioResource(s.stream, { inputType: s.type }));
      return;
    } catch (e) {
      logToDiscord(`⚠️ play.stream error: ${e?.message || e}`);
    }

    // 2) ytdl-core avec cookies (ne nécessite PAS x-youtube-identity-token)
    try {
      const resource = createAudioResource(
        ytdl(cur.url, {
          filter: "audioonly",
          quality: "highestaudio",
          highWaterMark: 1 << 25,
          requestOptions: { headers: makeYTHeaders() },
        })
      );
      this.player.play(resource);
      logToDiscord(`🔁 Fallback ytdl-core utilisé`);
      return;
    } catch (e) {
      const msg = e?.message || String(e);
      // erreurs fréquentes: 410 / 403 / 429
      logToDiscord(`⚠️ ytdl error: ${msg}`);
    }

    // 3) recherche d’une alternative “audio” (NCS, lyric, etc.)
    try {
      const results = await play.search(`${cur.title} audio`, {
        limit: 1,
        source: { youtube: "video" },
      });
      if (results[0]?.url) {
        const s = await play.stream(results[0].url, { quality: 2 });
        this.player.play(createAudioResource(s.stream, { inputType: s.type }));
        logToDiscord(`🔁 Source alternative utilisée`);
        return;
      }
    } catch (e) {
      logToDiscord(`⚠️ alt search error: ${e?.message || e}`);
    }

    // 4) anti-boucle / essais multiples
    cur.__tries = (cur.__tries || 0) + 1;
    if (cur.__tries < MAX_TRY_PER_TRACK) {
      logToDiscord(`🔄 Retry (${cur.__tries}/${MAX_TRY_PER_TRACK})...`);
      // petit délai pour éviter un spam d’erreurs
      await new Promise((r) => setTimeout(r, 1200));
      return this._playCurrent(voiceChannel);
    }

    // 5) abandon propre + passe au suivant
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
