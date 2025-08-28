import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  StreamType,
  AudioPlayerStatus,
  NoSubscriberBehavior,
  getVoiceConnection,
} from "@discordjs/voice";
import play from "play-dl";
import ytdl from "ytdl-core";
import { logToDiscord } from "../util/logger.js";

/** Construit des headers stables pour YouTube */
function buildYTHeaders() {
  const h = {
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    "accept-language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
    origin: "https://www.youtube.com",
    referer: "https://www.youtube.com/",
    // Ces deux-là aident à stabiliser la signature côté web client
    "x-youtube-client-name": "1",
    "x-youtube-client-version": "2.20250201.01.00",
  };
  if (process.env.YT_COOKIE) h.cookie = process.env.YT_COOKIE;
  if (process.env.YT_ID_TOKEN) h["x-youtube-identity-token"] = process.env.YT_ID_TOKEN;
  return h;
}

/** Sélectionne un format audio correct depuis ytdl.getInfo() */
function pickBestAudioFormat(info) {
  // audioOnly + plus haut bitrate
  const audioFormats = info.formats
    .filter(f => f.hasAudio && !f.hasVideo)
    .sort((a, b) => (b.audioBitrate || 0) - (a.audioBitrate || 0));
  return audioFormats[0] || null;
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

    // Compteur d’échecs par piste pour éviter les boucles
    this.failMap = new Map();

    this.player.on("stateChange", (oldS, newS) => {
      if (oldS.status !== newS.status) {
        console.log(`[voice] ${oldS.status} -> ${newS.status}`);
        logToDiscord(`[voice] ${oldS.status} → ${newS.status}`);
      }
      if (oldS.status !== AudioPlayerStatus.Idle && newS.status === AudioPlayerStatus.Idle) {
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
    if (this.connection && this.connection.joinConfig.channelId === voiceChannel.id) return this.connection;
    try {
      this.connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: this.guild.id,
        adapterCreator: this.guild.voiceAdapterCreator,
        selfDeaf: true,
      });
      this.connection.subscribe(this.player);
      logToDiscord(`🔌 Joint ${voiceChannel.name}`);
    } catch (e) {
      console.error("joinVoiceChannel error:", e);
      logToDiscord(`❌ joinVoiceChannel: ${e?.message || e}`);
      throw e;
    }
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

    this.ensureConnection(voiceChannel);
    logToDiscord(`🎶 Now playing: **${cur.title}**`);

    // Reset compteur d’échecs si on (re)tombe sur cette piste
    this.failMap.set(cur.url, 0);

    // 1) Tentative play-dl standard
    try {
      const stream = await play.stream(cur.url, { quality: 2 });
      const resource = createAudioResource(stream.stream, { inputType: stream.type });
      this.player.play(resource);
      return;
    } catch (e) {
      logToDiscord(`⚠️ play.stream error: ${e?.message || e}`);
    }

    // 2) Fallback play-dl from_info
    try {
      const info = await play.video_info(cur.url);
      const stream = await play.stream_from_info(info, { quality: 2 });
      const resource = createAudioResource(stream.stream, { inputType: stream.type });
      this.player.play(resource);
      return;
    } catch (e) {
      logToDiscord(`⚠️ play.stream_from_info error: ${e?.message || e}`);
    }

    // 3) Fallback ytdl-core (avec headers & retries anti-410)
    try {
      await this._playWithYTDL(cur.url);
      logToDiscord(`🔁 Fallback ytdl-core utilisé (cookie${process.env.YT_ID_TOKEN ? " + identity token" : ""})`);
      return;
    } catch (e) {
      logToDiscord(`❌ ytdl error: ${e?.message || e}`);
    }

    // 4) Dernier recours : rechercher une source alternative audio (mot-clé + "audio")
    try {
      const results = await play.search(`${cur.title} audio`, { limit: 1, source: { youtube: "video" } });
      if (results[0]?.url) {
        await this._playWithYTDL(results[0].url);
        logToDiscord(`🔁 Fallback alt source utilisé`);
        return;
      }
    } catch (e) {
      logToDiscord(`⚠️ alt search error: ${e?.message || e}`);
    }

    // Tout a échoué → skip
    logToDiscord(`❌ Impossible de jouer: ${cur.title} — skip`);
    await this.skip();
  }

  /**
   * Lecture via ytdl-core avec gestion d’erreurs 410/403 :
   * - tente direct download (headers)
   * - si 410/403 → regen info + downloadFromInfo
   * - max 2 retries par piste
   */
  async _playWithYTDL(url) {
    const headers = buildYTHeaders();
    const key = url;
    const tryCount = this.failMap.get(key) ?? 0;
    if (tryCount > 2) throw new Error("Too many retries for this track");

    const attempt = async (useInfoFlow = false) => {
      if (!useInfoFlow) {
        // chemin “simple”
        const ystream = ytdl(url, {
          filter: "audioonly",
          quality: "highestaudio",
          requestOptions: { headers },
          highWaterMark: 1 << 25,
          liveBuffer: 4000,
        });
        const resource = createAudioResource(ystream, { inputType: StreamType.Arbitrary });
        this.player.play(resource);
        return;
      } else {
        // regen URL depuis getInfo
        const info = await ytdl.getInfo(url, { requestOptions: { headers } });
        const fmt = pickBestAudioFormat(info);
        if (!fmt) throw new Error("No audio format found");
        const ystream = ytdl.downloadFromInfo(info, {
          requestOptions: { headers },
          quality: fmt.itag,
          highWaterMark: 1 << 25,
          liveBuffer: 4000,
        });
        const resource = createAudioResource(ystream, { inputType: StreamType.Arbitrary });
        this.player.play(resource);
        return;
      }
    };

    try {
      await attempt(false);
    } catch (e) {
      // Si code HTTP 410/403 ou “status code: 410/403” → on retente une seule fois avec getInfo
      const msg = (e && (e.message || e.toString())) || "";
      const isHttp410 = /410/.test(msg);
      const isHttp403 = /403/.test(msg);
      this.failMap.set(key, tryCount + 1);

      if (isHttp410 || isHttp403) {
        logToDiscord(`🔄 ytdl retry (regen url) après ${isHttp410 ? "410" : "403"}`);
        await attempt(true);
      } else {
        throw e;
      }
    }
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
