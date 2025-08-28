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
    if (this.connection && this.connection.joinConfig.channelId === voiceChannel.id) {
      return this.connection;
    }
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
    this.ensureConnection(voiceChannel);

    logToDiscord(`🎶 Now playing: **${cur.title}**`);

    try {
      // 🔹 play-dl stream
      const stream = await play.stream(cur.url, { quality: 2 });
      const resource = createAudioResource(stream.stream, { inputType: stream.type });
      this.player.play(resource);
      return;
    } catch (e) {
      console.error("play-dl error:", e?.message || e);
      logToDiscord(`⚠️ play-dl stream failed, trying ytdl-core`);
    }

    try {
      // 🔹 fallback ytdl-core
      const headers = {};
      if (process.env.YT_COOKIE) {
        headers["cookie"] = process.env.YT_COOKIE;
        headers["user-agent"] = "Mozilla/5.0";
      }
      const ystream = ytdl(cur.url, {
        filter: "audioonly",
        quality: "highestaudio",
        requestOptions: { headers },
        highWaterMark: 1 << 25,
      });
      const resource = createAudioResource(ystream);
      this.player.play(resource);
      logToDiscord(`🔁 Fallback ytdl-core utilisé`);
      return;
    } catch (e) {
      console.error("ytdl-core error:", e?.message || e);
      logToDiscord(`❌ ytdl-core fail: ${e?.message}`);
    }

    // 🔹 skip si rien n’a marché
    logToDiscord(`❌ Impossible de jouer: ${cur.title} — skipped`);
    await this.skip();
  }

  async _playNext() {
    if (!this.queue.moveNext()) {
      this.player.stop(true);
      logToDiscord(`⏹️ File terminée`);
      return;
    }
    const vc = this._getBoundVoiceChannel();
    if (vc) await this._playCurrent(vc);
  }

  _getBoundVoiceChannel() {
    const conn = getVoiceConnection(this.guild.id);
    if (!conn) return null;
    return this.guild.channels.cache.get(conn.joinConfig.channelId) || null;
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
