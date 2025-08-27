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

// ====== Helpers Piped (inline, pas de fichier en plus) ======
const PIPED_INSTANCES = [
  "https://piped.video",
  "https://pipedapi.kavin.rocks",
  "https://piped.video",
];
const extractVid = (input) => {
  try {
    if (!input) return null;
    if (/^[\w-]{11}$/.test(input)) return input;
    const u = new URL(input);
    if (u.hostname.includes("youtube.com")) return u.searchParams.get("v");
    if (u.hostname.includes("youtu.be")) return u.pathname.slice(1);
  } catch {}
  return null;
};
async function pipedAudioUrl(videoIdOrUrl) {
  const id = extractVid(videoIdOrUrl) || videoIdOrUrl;
  if (!id) throw new Error("no_video_id");

  let lastErr;
  for (const base of PIPED_INSTANCES) {
    try {
      const res = await fetch(`${base}/api/v1/streams/${id}`, {
        headers: { "user-agent": "Mozilla/5.0", accept: "application/json" },
      });
      if (!res.ok) {
        lastErr = new Error(`piped ${base} ${res.status}`);
        continue;
      }
      const j = await res.json();
      // prioriser webm/opus
      const audio =
        (j.audioStreams || []).find(
          (a) =>
            /webm/i.test(a.mimeType || "") &&
            /(opus|webm)/i.test(a.codec || a.audioCodec || "")
        ) || (j.audioStreams || [])[0];
      if (!audio?.url) {
        lastErr = new Error(`piped ${base} no audio`);
        continue;
      }
      return audio.url;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error("piped_failed");
}

// ===========================================================

export class GuildPlayer {
  constructor(guild, queue, textChannel) {
    this.guild = guild;
    this.queue = queue;
    this.textChannel = textChannel;

    this.connection = null;
    this.player = createAudioPlayer({
      behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
    });

    // anti-boucle erreurs (même piste qui spam)
    this.failCount = new Map();

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
    if (this.player.state.status === AudioPlayerStatus.Idle && this.queue.index === -1) {
      this.queue.index = 0;
      await this._playCurrent(voiceChannel);
      return "started";
    }
    return "queued";
  }

  // crée une ressource sans FFmpeg, on FORCE Opus
  _makeResource(stream /*, kind */) {
    return createAudioResource(stream, {
      inputType: StreamType.Opus,
      inlineVolume: false,
      metadata: { title: this.queue.current?.title, url: this.queue.current?.url },
    });
  }

  async _playCurrent(voiceChannel) {
    const cur = this.queue.current;
    if (!cur) return;
    this.ensureConnection(voiceChannel);

    logToDiscord(`🎶 Now playing: **${cur.title}**`);

    // 1) play-dl — flux compatible Discord (Opus)
    try {
      const opt = { quality: 2, discordPlayerCompatibility: true };
      if (process.env.YT_COOKIE) opt.cookie = process.env.YT_COOKIE;

      const s = await play.stream(cur.url, opt);
      logToDiscord(`🎧 play-dl type=${s.type}`);
      this.player.play(this._makeResource(s.stream, s.type));
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
      this.player.play(this._makeResource(s.stream, s.type));
      return;
    } catch (e) {
      console.error("stream_from_info error:", e?.message || e);
    }

    // 3) rechercher un autre résultat
    try {
      const results = await play.search(`${cur.title} audio`, {
        limit: 1,
        source: { youtube: "video" },
      });
      if (results[0]?.url) {
        const s = await play.stream(results[0].url, {
          quality: 2,
          discordPlayerCompatibility: true,
        });
        this.player.play(this._makeResource(s.stream, s.type));
        logToDiscord(`🔁 Fallback source utilisée`);
        return;
      }
    } catch (e) {
      console.error("search/alt error:", e?.message || e);
    }

    // 4) ytdl-core (webm/opus) — PAS de cookie si pas cookie d’identité
    try {
      const raw = process.env.YT_COOKIE || "";
      const hasIdentity = /(SAPISID|__Secure-3PAPISID|PAPISID)=/.test(raw);
      const headers = {
        "user-agent":
          "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
        "accept-language": "fr-FR,fr;q=0.9",
      };
      if (hasIdentity) headers.cookie = raw;

      const ystream = ytdl(cur.url, {
        filter: "audioonly",
        quality: "highestaudio",
        highWaterMark: 1 << 25,
        dlChunkSize: 0,
        requestOptions: { headers },
      });
      ystream.on("error", (err) => logToDiscord(`ytdl error: ${err?.message || err}`));

      this.player.play(this._makeResource(ystream, "webm/opus"));
      logToDiscord(
        `🔁 Fallback ytdl-core utilisé${hasIdentity ? " (with cookie)" : " (no cookie)"}`
      );
      return;
    } catch (e) {
      console.error("ytdl fallback error:", e?.message || e);
    }

    // 5) Piped (proxy YouTube) — webm/opus direct
    try {
      const url = await pipedAudioUrl(cur.url);
      const resp = await fetch(url, {
        headers: {
          "user-agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36",
          accept: "*/*",
        },
      });
      if (!resp.ok || !resp.body) throw new Error(`piped resp ${resp.status}`);

      this.player.play(this._makeResource(resp.body, "webm/opus"));
      logToDiscord(`🪄 Fallback Piped utilisé`);
      return;
    } catch (e) {
      logToDiscord(`piped fallback failed: ${e?.message || e}`);
    }

    // --- tout a échoué → anti-boucle + skip ---
    const key = cur.url || cur.title;
    const n = (this.failCount.get(key) || 0) + 1;
    this.failCount.set(key, n);

    if (n >= 2) {
      logToDiscord(`⛔ Échec répété, on abandonne cette piste.`);
      // on passe à la suivante sans relancer la même en boucle
      if (this.queue.moveNext()) {
        const vc = this._getBoundVoiceChannel();
        if (vc) return this._playCurrent(vc);
      }
      this.player.stop(true);
      logToDiscord(`⏹️ File terminée`);
      return;
    }

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
