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

function ytHeaders() {
  const headers = {
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
    "accept-language": "fr-FR,fr;q=0.9,en;q=0.8",
  };
  if (process.env.YT_COOKIE) headers.cookie = process.env.YT_COOKIE;
  if (process.env.YT_ID_TOKEN) headers["x-youtube-identity-token"] = process.env.YT_ID_TOKEN;
  return headers;
}

function pickBestAudioFormat(info) {
  const fmts = info?.formats?.filter(f => f.hasAudio && !f.hasVideo);
  if (!fmts?.length) return null;
  // privilégie opus/webm sinon m4a
  const opus = fmts.find(f => /audio\/webm/.test(f.mimeType));
  return opus || fmts[0];
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

    // 1) play-dl (avec cookies/idToken si fournis)
    try {
      const stream = await play.stream(cur.url, { quality: 2 });
      const resource = createAudioResource(stream.stream, { inputType: stream.type });
      this.player.play(resource);
      return;
    } catch (e) {
      console.warn("play.stream error:", e?.message || e);
      logToDiscord(`⚠️ play.stream error: ${e?.message || e}`);
    }

    // 2) play-dl: video_info + stream_from_info (second essai)
    try {
      const info = await play.video_info(cur.url);
      const stream = await play.stream_from_info(info, { quality: 2 });
      const resource = createAudioResource(stream.stream, { inputType: stream.type });
      this.player.play(resource);
      return;
    } catch (e) {
      console.warn("play.stream_from_info error:", e?.message || e);
      logToDiscord(`⚠️ play.stream_from_info error: ${e?.message || e}`);
    }

    // 3) Fallback ytdl-core — 1 retry «410» max
    await this._playWithYTDL(cur.url);
  }

  async _playWithYTDL(url) {
    const headers = ytHeaders();
    let retried = false;

    const start = async () => {
      try {
        // getInfo pour éviter d’avoir un format expiré
        const info = await ytdl.getInfo(url, { requestOptions: { headers } });
        const fmt = pickBestAudioFormat(info);
        if (!fmt) throw new Error("No audio-only format found");

        const ystream = ytdl.downloadFromInfo(info, {
          requestOptions: { headers },
          quality: fmt.itag,
          highWaterMark: 1 << 25,
        });

        ystream.on("error", async (err) => {
          const msg = String(err?.message || err);
          logToDiscord(`❗ ytdl error: ${msg}`);
          if (!retried && /410|403/.test(msg)) {
            retried = true;
            logToDiscord(`🔄 Flux expiré (Status ${msg.match(/\d+/)?.[0] || "??"}), retry getInfo`);
            try {
              const info2 = await ytdl.getInfo(url, { requestOptions: { headers } });
              const fmt2 = pickBestAudioFormat(info2);
              if (!fmt2) throw new Error("No audio format on retry");
              const s2 = ytdl.downloadFromInfo(info2, {
                requestOptions: { headers },
                quality: fmt2.itag,
                highWaterMark: 1 << 25,
              });
              this.player.play(createAudioResource(s2, { inputType: StreamType.Arbitrary }));
            } catch (e2) {
              logToDiscord(`❌ retry getInfo a échoué: ${e2?.message || e2}`);
              await this.skip();
            }
          } else {
            await this.skip();
          }
        });

        this.player.play(createAudioResource(ystream, { inputType: StreamType.Arbitrary }));
        logToDiscord(`🔁 Fallback ytdl-core utilisé (cookie${headers["x-youtube-identity-token"] ? " + id" : ""})`);
      } catch (e) {
        const msg = e?.message || e;
        logToDiscord(`❌ ytdl getInfo failed: ${msg}`);
        await this.skip();
      }
    };

    await start();
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
