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

    await logToDiscord(`🎶 Now playing: **${cur.title}**`);
    const maxAttempts = 3;
    let attempt = 0;

    const cookie = process.env.YT_COOKIE?.trim();
    const idToken = process.env.YT_ID_TOKEN?.trim();

    // helper: crée une resource depuis stream
    const playResource = (stream, typeOverride) => {
      const resource = createAudioResource(stream, { inputType: typeOverride || StreamType.Arbitrary });
      this.player.play(resource);
    };

    // A) play-dl
    while (attempt < maxAttempts) {
      try {
        attempt++;
        const opt = { quality: 2 };
        if (cookie) opt.cookie = cookie;
        if (idToken) opt.headers = { 'x-youtube-identity-token': idToken };

        const s = await play.stream(cur.url, opt);
        playResource(s.stream, s.type);
        return;
      } catch (e) {
        const msg = String(e?.message || e);
        await logToDiscord(`⚠️ play.stream error: ${msg}`);
        // 410/429 → on retente en ajustant
        if (msg.includes('410') && attempt < maxAttempts) continue;
        break;
      }
    }

    // B) play-dl via info
    try {
      const info = await play.video_info(cur.url, cookie ? { cookie } : {});
      const s2 = await play.stream_from_info(info, cookie ? { cookie } : {});
      playResource(s2.stream, s2.type);
      return;
    } catch (e) {
      await logToDiscord(`⚠️ play.stream_from_info error: ${e?.message || e}`);
    }

    // C) ytdl-core, avec headers si dispos
    try {
      const headers = {};
      if (cookie) headers['cookie'] = cookie;
      if (idToken) headers['x-youtube-identity-token'] = idToken;
      if (cookie || idToken) {
        await logToDiscord('🔁 Fallback ytdl-core utilisé (cookie + identity token)');
      } else {
        await logToDiscord('🔁 Fallback ytdl-core utilisé (no cookie)');
      }

      const ystream = ytdl(cur.url, {
        filter: 'audioonly',
        quality: 'highestaudio',
        highWaterMark: 1 << 25,
        requestOptions: { headers },
      });

      ystream.on('error', (err) => {
        logToDiscord(`ytdl error: ${err?.message || err}`);
      });

      playResource(ystream);
      return;
    } catch (e) {
      await logToDiscord(`ytdl fatal: ${e?.message || e}`);
    }

    // D) dernier essai: recherche alternative (titre + "audio")
    try {
      const res = await play.search(`${cur.title} audio`, { limit: 1, source: { youtube: 'video' } });
      if (res?.[0]?.url) {
        const s = await play.stream(res[0].url, cookie ? { cookie } : {});
        playResource(s.stream, s.type);
        await logToDiscord('🔁 Source alternative utilisée');
        return;
      }
    } catch (e) {
      await logToDiscord(`alt search error: ${e?.message || e}`);
    }

    await logToDiscord(`❌ Impossible de jouer: ${cur.title} — skip`);
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
