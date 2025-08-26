import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  AudioPlayerStatus,
  NoSubscriberBehavior,
  getVoiceConnection,
} from "@discordjs/voice";
import play from "play-dl";
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
      // logs utiles
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
    // si rien ne joue → démarre direct
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

    // 1) tentative standard
    try {
      const stream = await play.stream(cur.url, { quality: 2 });
      const resource = createAudioResource(stream.stream, { inputType: stream.type });
      this.player.play(resource);
      return;
    } catch (e) {
      console.error("play.stream error:", e?.message || e);
      logToDiscord(`⚠️ stream failed → retry alt source`);
    }

    // 2) fallback: récupérer info puis stream_from_info
    try {
      const info = await play.video_info(cur.url);
      const stream = await play.stream_from_info(info, { quality: 2 });
      const resource = createAudioResource(stream.stream, { inputType: stream.type });
      this.player.play(resource);
      return;
    } catch (e) {
      console.error("stream_from_info error:", e?.message || e);
    }

    // 3) dernier fallback: rechercher un “audio” alternatif
    try {
      const results = await play.search(`${cur.title} audio`, { limit: 1, source: { youtube: "video" } });
      if (results[0]?.url) {
        const s = await play.stream(results[0].url, { quality: 2 });
        const resource = createAudioResource(s.stream, { inputType: s.type });
        this.player.play(resource);
        logToDiscord(`🔁 Fallback source utilisée`);
        return;
      }
    } catch {}

    // si tout a échoué → passer au suivant
    logToDiscord(`❌ Impossible de jouer: ${cur.title} — on skip`);
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
