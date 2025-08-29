import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  NoSubscriberBehavior,
  AudioPlayerStatus,
  getVoiceConnection,
  StreamType,
} from '@discordjs/voice';
import play from 'play-dl';
import ytdl from 'ytdl-core';
import { Queue } from './queue.js';
import { logToDiscord } from '../util/logger.js';
import { ffmpegCmd } from '../util/ffmpeg.js';
import ffmpegStatic from 'ffmpeg-static';

// Fixe la variable si elle ne l’a pas été (double sécurité)
process.env.FFMPEG_PATH = process.env.FFMPEG_PATH || ffmpegStatic || 'ffmpeg';
console.log(`[ffmpeg] FFMPEG_PATH=${process.env.FFMPEG_PATH}`);

const players = new Map(); // guildId -> GuildPlayer

export function getOrCreateGuildPlayer(guild, textChannel) {
  let gp = players.get(guild.id);
  if (!gp) {
    gp = new GuildPlayer(guild, textChannel);
    players.set(guild.id, gp);
  } else if (textChannel) {
    gp.textChannel = textChannel;
  }
  return gp;
}

export class GuildPlayer {
  constructor(guild, textChannel) {
    this.guild = guild;
    this.textChannel = textChannel;
    this.queue = new Queue();
    this.connection = null;
    this.player = createAudioPlayer({
      behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
    });

    this.player.on('stateChange', (o, n) => {
      if (o.status !== n.status) {
        console.log(`[voice] ${o.status} -> ${n.status}`);
        logToDiscord(`[voice] ${o.status} → ${n.status}`);
      }
      if (o.status !== AudioPlayerStatus.Idle && n.status === AudioPlayerStatus.Idle) {
        this._playNext().catch(() => {});
      }
    });

    this.player.on('error', (err) => {
      logToDiscord(`❌ Audio error: ${err?.message || err}`);
      this._playNext().catch(() => {});
    });
  }

  ensureConnection(voiceChannel) {
    if (this.connection && this.connection.joinConfig.channelId === voiceChannel.id) return this.connection;
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
      return 'started';
    }
    return 'queued';
  }

  async _playCurrent(voiceChannel) {
    const cur = this.queue.current;
    if (!cur) return;

    this.ensureConnection(voiceChannel);
    logToDiscord(`🎶 Now playing: **${cur.title}**`);

    // anti-boucle: 3 essais max par piste
    cur._retries ??= 0;
    const maxRetries = 3;
    const isExpired410 = (e) =>
      e?.statusCode === 410 ||
      /status\s*code\s*:\s*410/i.test(e?.message || "");

    // ---------- ESSAI 1 : play.stream ----------
    try {
      const s1 = await play.stream(cur.url, { quality: 2 });
      const res1 = createAudioResource(s1.stream, { inputType: s1.type });
      this.player.play(res1);
      return;
    } catch (e) {
      cur._retries++;
      console.warn("play.stream error:", e?.message || e);
      logToDiscord(`⚠️ play.stream error: ${e?.message || e}`);
      if (!isExpired410(e) && cur._retries >= maxRetries) {
        logToDiscord("🛑 trop d'essais — skip");
        await this.skip();
        return;
      }
    }

    // ---------- ESSAI 2 : video_info -> stream_from_info ----------
    try {
      const info = await play.video_info(cur.url);
      const s2 = await play.stream_from_info(info, { quality: 2 });
      const res2 = createAudioResource(s2.stream, { inputType: s2.type });
      this.player.play(res2);
      return;
    } catch (e) {
      cur._retries++;
      console.warn("play.stream_from_info error:", e?.message || e);
      logToDiscord(`⚠️ play.stream_from_info error: ${e?.message || e}`);
      if (!isExpired410(e) && cur._retries >= maxRetries) {
        logToDiscord("🛑 trop d'essais — skip");
        await this.skip();
        return;
      }
    }

    // ---------- ESSAI 3 : ytdl-core avec headers ----------
    try {
      const headers = {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
        "accept-language": "fr-FR,fr;q=0.9",
      };
      if (process.env.YT_COOKIE) headers.cookie = process.env.YT_COOKIE.trim();
      if (process.env.YT_CLIENT_ID)
        headers["x-youtube-identity-token"] = process.env.YT_CLIENT_ID.trim();

      const ystream = ytdl(cur.url, {
        filter: "audioonly",
        quality: "highestaudio",
        highWaterMark: 1 << 25,
        requestOptions: { headers },
      });

      const res3 = createAudioResource(ystream /* , { inputType: StreamType.Arbitrary } */);
      this.player.play(res3);
      logToDiscord(`🔁 Fallback ytdl-core utilisé (cookie${process.env.YT_CLIENT_ID ? " + identity" : ""})`);
      return;
    } catch (e) {
      cur._retries++;
      console.warn("ytdl error:", e?.message || e);
      logToDiscord(`⚠️ ytdl error: ${e?.message || e}`);
    }

    // ---------- si tout a échoué ----------
    logToDiscord(`❌ Impossible de jouer: ${cur.title} — skip`);
    await this.skip();
  }

  async _playNext() {
    if (!this.queue.moveNext()) {
      this.player.stop(true);
      await logToDiscord('⏹️ File terminée');
      return;
    }
    const vc = this._getBoundVoiceChannel();
    if (!vc) return;
    await this._playCurrent(vc);
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
