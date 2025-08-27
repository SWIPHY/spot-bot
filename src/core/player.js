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

export class GuildPlayer {
  constructor(guild, queue, textChannel) {
    this.guild = guild;
    this.queue = queue;
    this.textChannel = textChannel;

    this.connection = null;
    this.player = createAudioPlayer({
      behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
    });

    // Logs utiles d'état du player
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

  // helper: crée une ressource "sans FFmpeg" en forçant un flux OPUS
  _makeResource(stream, kind) {
    // on force Opus pour éviter tout probe/ffmpeg
    const type = StreamType.Opus;
    return createAudioResource(stream, {
      inputType: type,
      inlineVolume: false,
      metadata: { title: this.queue.current?.title, url: this.queue.current?.url },
    });
  }

  async _playCurrent(voiceChannel) {
    const cur = this.queue.current;
    if (!cur) return;
    this.ensureConnection(voiceChannel);

    logToDiscord(`🎶 Now playing: **${cur.title}**`);

    // 1) play-dl → flux OPUS compatible Discord (pas de FFmpeg)
    try {
      const opt = { quality: 2, discordPlayerCompatibility: true };
      if (process.env.YT_COOKIE) opt.cookie = process.env.YT_COOKIE;

      const s = await play.stream(cur.url, opt);
      logToDiscord(`🎧 play-dl type=${s.type}`);
      const resource = this._makeResource(s.stream, s.type);
      this.player.play(resource);
      return;
    } catch (e) {
      console.error("play.stream error:", e?.message || e);
      logToDiscord(`⚠️ stream failed → retry alt source`);
    }

    // 2) play-dl depuis info
    try {
      const info = await play.video_info(cur.url);
      const s = await play.stream_from_info(info, { quality: 2, discordPlayerCompatibility: true });
      logToDiscord(`🎧 play-dl from_info type=${s.type}`);
      const resource = this._makeResource(s.stream, s.type);
      this.player.play(resource);
      return;
    } catch (e) {
      console.error("stream_from_info error:", e?.message || e);
    }

    // 3) chercher une autre source "audio"
    try {
      const results = await play.search(`${cur.title} audio`, { limit: 1, source: { youtube: "video" } });
      if (results[0]?.url) {
        const s = await play.stream(results[0].url, { quality: 2, discordPlayerCompatibility: true });
        const resource = this._makeResource(s.stream, s.type);
        this.player.play(resource);
        logToDiscord(`🔁 Fallback source utilisée`);
        return;
      }
    } catch (e) {
      console.error("search/alt error:", e?.message || e);
    }

    // 4) dernier fallback: ytdl-core (webm/opus) SANS cookie IDENTITÉ
    try {
      // On n’envoie le cookie à ytdl-core QUE si c’est un cookie "connecté"
      const raw = process.env.YT_COOKIE || "";
      const hasIdentity = /(SAPISID|__Secure-3PAPISID|PAPISID)=/.test(raw);

      const headers = {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
        "accept-language": "fr-FR,fr;q=0.9",
      };
      if (hasIdentity) headers.cookie = raw; // sinon on n’en met PAS (évite l’erreur)

      const ystream = ytdl(cur.url, {
        filter: "audioonly",
        quality: "highestaudio",
        highWaterMark: 1 << 25,
        dlChunkSize: 0,
        requestOptions: { headers },
      });

      ystream.on("error", (err) =>
        logToDiscord(`ytdl error: ${err?.message || err}`)
      );

      // on force un flux Opus pour éviter toute détection/ffmpeg
      const resource = this._makeResource(ystream, "webm/opus");
      this.player.play(resource);
      logToDiscord(
        `🔁 Fallback ytdl-core utilisé${hasIdentity ? " (with cookie)" : " (no cookie)"}`
      );
      return;
    } catch (e) {
      console.error("ytdl fallback error:", e?.message || e);
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

