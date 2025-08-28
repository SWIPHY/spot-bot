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

// —— Tokens pour play-dl (YouTube)
try {
  if (process.env.YT_COOKIE) {
    await play.setToken({
      youtube: {
        cookie: process.env.YT_COOKIE,
        identityToken: process.env.YT_IDENTITY_TOKEN || undefined,
      },
    });
  }
} catch (e) {
  console.warn("play-dl setToken warn:", e?.message || e);
}

function buildYTHeaders() {
  if (!process.env.YT_COOKIE) return {};
  return {
    cookie: process.env.YT_COOKIE,
    "user-agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
    "accept-language": "fr-FR,fr;q=0.9,en;q=0.8",
  };
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
    // anti-boucle: reset compteur à l’ajout
    track._tries = 0;
    this.queue.push(track);

    if (
      this.player.state.status === AudioPlayerStatus.Idle &&
      this.queue.index === -1
    ) {
      this.queue.index = 0;
      await this._playCurrent(voiceChannel);
      return "started";
    }
    return "queued";
  }

  async _createResource(url) {
    // 1) play-dl direct
    try {
      const s = await play.stream(url, { quality: 2 });
      return createAudioResource(s.stream, { inputType: s.type });
    } catch (e) {
      console.warn("play.stream failed:", e?.message || e);
    }

    // 2) play-dl via info
    try {
      const info = await play.video_info(url);
      const s = await play.stream_from_info(info, { quality: 2 });
      return createAudioResource(s.stream, { inputType: s.type });
    } catch (e) {
      console.warn("play.stream_from_info failed:", e?.message || e);
    }

    // 3) ytdl-core (cookie si dispo)
    try {
      const headers = buildYTHeaders();
      const ystream = ytdl(url, {
        filter: "audioonly",
        quality: "highestaudio",
        requestOptions: Object.keys(headers).length ? { headers } : undefined,
        highWaterMark: 1 << 25,
        dlChunkSize: 0,
      });
      return createAudioResource(ystream, { inputType: StreamType.Arbitrary });
    } catch (e) {
      console.warn("ytdl-core failed:", e?.message || e);
    }

    return null;
  }

  async _playCurrent(voiceChannel) {
    const cur = this.queue.current;
    if (!cur) return;

    this.ensureConnection(voiceChannel);
    logToDiscord(`🎶 Now playing: **${cur.title}**`);

    const res = await this._createResource(cur.url);
    if (res) {
      this.player.play(res);
      return;
    }

    // Si tout échoue, dernier essai: rechercher une source alternative audio
    try {
      if ((cur._tries || 0) < 1) {
        cur._tries = (cur._tries || 0) + 1;
        const results = await play.search(`${cur.title} audio`, {
          limit: 1,
          source: { youtube: "video" },
        });
        if (results[0]?.url) {
          const alt = await this._createResource(results[0].url);
          if (alt) {
            logToDiscord(`🔁 Fallback source utilisée`);
            this.player.play(alt);
            return;
          }
        }
      }
    } catch (_) {}

    // abandon propre
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

  pause() {
    this.player.pause(true);
  }
  resume() {
    this.player.unpause();
  }
  stop() {
    this.queue.clear();
    this.player.stop(true);
    const conn = getVoiceConnection(this.guild.id);
    if (conn) conn.destroy();
  }
  async skip() {
    this.player.stop(true);
  }
}
