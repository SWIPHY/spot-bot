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

/* ---------- utils ---------- */

function pickBestAudioFormat(info) {
  // privilégie opus/webm, sinon meilleur audio-only
  const formats = info?.formats || [];
  const opus = formats
    .filter(f => f.audioCodec?.includes("opus") && !f.hasVideo)
    .sort((a, b) => (b.audioBitrate || 0) - (a.audioBitrate || 0));
  if (opus[0]) return opus[0];

  const audioOnly = formats
    .filter(f => !f.hasVideo && (f.audioBitrate || 0) > 0)
    .sort((a, b) => (b.audioBitrate || 0) - (a.audioBitrate || 0));
  return audioOnly[0] || null;
}

function ytHeaders() {
  const h = {
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
    "accept-language": "fr-FR,fr;q=0.9,en;q=0.8",
  };
  if (process.env.YT_COOKIE) h.cookie = process.env.YT_COOKIE;
  if (process.env.YT_ID_TOKEN) h["x-youtube-identity-token"] = process.env.YT_ID_TOKEN;
  return h;
}

/* ---------- player ---------- */

export class GuildPlayer {
  constructor(guild, queue, textChannel) {
    this.guild = guild;
    this.queue = queue;
    this.textChannel = textChannel;

    this.connection = null;
    this.player = createAudioPlayer({
      behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
    });

    // pour limiter les retries par vidéo (éviter boucles)
    this.failMap = new Map(); // key=url, value=tryCount

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

    // 1) tentative standard via play-dl
    try {
      const stream = await play.stream(cur.url, { quality: 2 });
      const resource = createAudioResource(stream.stream, { inputType: stream.type });
      this.player.play(resource);
      return;
    } catch (e) {
      console.error("play.stream error:", e?.message || e);
      logToDiscord(`⚠️ play.stream error: ${e?.message || e}`);
    }

    // 2) play-dl from info
    try {
      const info = await play.video_info(cur.url);
      const stream = await play.stream_from_info(info, { quality: 2 });
      const resource = createAudioResource(stream.stream, { inputType: stream.type });
      this.player.play(resource);
      return;
    } catch (e) {
      console.error("play.stream_from_info error:", e?.message || e);
      logToDiscord(`⚠️ play.stream_from_info error: ${e?.message || e}`);
    }

    // 3) fallback ytdl-core + cookies + retry 410/403
    try {
      await this._playWithYTDL(cur.url);
      logToDiscord(`🔁 Fallback ytdl-core utilisé (cookie ${process.env.YT_COOKIE ? "+ identity token" : ""})`);
      return;
    } catch (e) {
      console.error("ytdl fallback error:", e?.message || e);
      logToDiscord(`❌ ytdl error: ${e?.message || e}`);
    }

    // échec → skip
    logToDiscord(`❌ Impossible de jouer: ${cur.title} — skip`);
    await this.skip();
  }

  async _playWithYTDL(url) {
    const headers = ytHeaders();
    const key = url;
    const tryCount = this.failMap.get(key) || 0;
    if (tryCount > 2) throw new Error("Too many retries");

    const attempt = async (useInfoFlow = false) => {
      if (!useInfoFlow) {
        const ystream = ytdl(url, {
          filter: "audioonly",
          quality: "highestaudio",
          requestOptions: { headers },
          highWaterMark: 1 << 25,
          liveBuffer: 4000,
        });

        // 👉 capter les 410/403 au niveau du flux
        ystream.on("error", (err) => {
          const msg = String(err?.message || err);
          if (/410|403/.test(msg)) {
            logToDiscord(`🔄 Flux expiré (${msg}), retry avec getInfo`);
            this.failMap.set(key, tryCount + 1);
            attempt(true).catch(e2 => {
              logToDiscord(`❌ retry getInfo a échoué: ${e2?.message || e2}`);
              this.skip();
            });
          }
        });

        const resource = createAudioResource(ystream, { inputType: StreamType.Arbitrary });
        this.player.play(resource);
        return;
      } else {
        const info = await ytdl.getInfo(url, { requestOptions: { headers } });
        const fmt = pickBestAudioFormat(info);
        if (!fmt) throw new Error("No audio format found");

        const ystream = ytdl.downloadFromInfo(info, {
          requestOptions: { headers },
          quality: fmt.itag,
          highWaterMark: 1 << 25,
          liveBuffer: 4000,
        });

        ystream.on("error", (err) => {
          const msg = String(err?.message || err);
          logToDiscord(`❌ ytdl info-stream error: ${msg}`);
        });

        const resource = createAudioResource(ystream, { inputType: StreamType.Arbitrary });
        this.player.play(resource);
        return;
      }
    };

    await attempt(false);
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
