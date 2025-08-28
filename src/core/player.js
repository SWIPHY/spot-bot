// src/core/player.js
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

const UA =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36";

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

    // --- Tentative A : play-dl standard (sans cookie obligatoire)
    try {
      const s = await play.stream(cur.url, { quality: 2 });
      const res = createAudioResource(s.stream, { inputType: s.type });
      this.player.play(res);
      return;
    } catch (e) {
      logToDiscord(`⚠️ play.stream error: ${e?.message || e}`);
    }

    // --- Tentative B : ytdl-core avec ou sans cookie + identity token
    try {
      const headers = {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
        "accept-language": "fr-FR,fr;q=0.9,en-US;q=0.8,en;q=0.7",
        // ces deux-là ne sont ajoutés que si .env les fournit
        ...(process.env.YT_COOKIE && process.env.YT_ID_TOKEN
          ? {
              cookie: process.env.YT_COOKIE,
              "x-youtube-identity-token": process.env.YT_ID_TOKEN,
              origin: "https://www.youtube.com",
              referer: "https://www.youtube.com/",
            }
          : {}),
      };

      const ystream = ytdl(cur.url, {
        filter: "audioonly",
        quality: "highestaudio",
        highWaterMark: 1 << 25,
        requestOptions: { headers },
      });

      const res = createAudioResource(ystream, { inputType: StreamType.Arbitrary });
      this.player.play(res);
      logToDiscord(
        process.env.YT_COOKIE && process.env.YT_ID_TOKEN
          ? "🔁 Fallback ytdl-core utilisé (cookie + identity token)"
          : "🔁 Fallback ytdl-core utilisé (sans cookie)"
      );
      return;
    } catch (e) {
      logToDiscord(`⚠️ ytdl error: ${e?.message || e}`);
    }

    // --- Tentative C : recherche alternative (sans boucle)
    try {
      const results = await play.search(`${cur.title} audio`, {
        limit: 1,
        source: { youtube: "video" },
      });
      if (results[0]?.url) {
        const s = await play.stream(results[0].url, { quality: 2 });
        const res = createAudioResource(s.stream, { inputType: s.type });
        this.player.play(res);
        logToDiscord(`🔁 Source alternative trouvée`);
        return;
      }
    } catch (e) {
      logToDiscord(`⚠️ alt search error: ${e?.message || e}`);
    }

    // Si tout échoue : skip
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
