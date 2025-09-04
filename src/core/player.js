import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  NoSubscriberBehavior,
  AudioPlayerStatus,
  getVoiceConnection,
  StreamType
} from "@discordjs/voice";
import play from "play-dl";
import { logToDiscord } from "../util/logger.js";
import { ffmpegCmd } from "../util/ffmpeg.js";

const players = new Map(); // guildId -> GuildPlayer

export function getOrCreateGuildPlayer(guild, textChannel, client) {
  let gp = players.get(guild.id);
  if (!gp) {
    gp = new GuildPlayer(guild, textChannel, client);
    players.set(guild.id, gp);
  } else if (textChannel) {
    gp.textChannel = textChannel;
  }
  return gp;
}

class GuildPlayer {
  constructor(guild, textChannel, client) {
    this.guild = guild;
    this.textChannel = textChannel;
    this.client = client;

    this.queue = null; // on attend que tes commandes y placent la Queue
    this.connection = null;

    this.player = createAudioPlayer({
      behaviors: { noSubscriber: NoSubscriberBehavior.Pause }
    });

    this.player.on("stateChange", (o, n) => {
      if (o.status === n.status) return;
      logToDiscord(this.client, "LOG", `[voice] ${o.status} -> ${n.status}`);
      if (n.status === AudioPlayerStatus.Idle) {
        this._playNext().catch(err =>
          logToDiscord(this.client, "ERROR", "playNext error", err)
        );
      }
    });

    this.player.on("error", (err) => {
      logToDiscord(this.client, "ERROR", `AudioPlayer error: ${err.message}`, err);
    });
  }

  async connect(voiceChannel) {
    if (this.connection) return this.connection;
    this.connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: this.guild.id,
      adapterCreator: this.guild.voiceAdapterCreator,
      selfDeaf: true
    });
    this.connection.subscribe(this.player);
    return this.connection;
  }

  setQueue(queue) {
    this.queue = queue; // instance de core/queue.js
  }

  async playOrEnqueue(track) {
    if (!this.queue) throw new Error("Queue non initialisée");
    this.queue.push(track);
    if (this.player.state.status === AudioPlayerStatus.Idle && this.queue.index < 0) {
      await this._playNext();
    } else {
      await logToDiscord(this.client, "INFO", `➕ Ajouté à la file: **${track.title}**`);
    }
  }

  async _playNext() {
    if (!this.queue) return;

    const hasNext = this.queue.index < 0 ? this.queue.moveNext() : this.queue.moveNext();
    if (!hasNext) {
      await logToDiscord(this.client, "INFO", "✅ File terminée.");
      return;
    }

    const current = this.queue.current;
    if (!current) return;

    try {
      // Récupère un flux avec play-dl (stream + type)
      const s = await play.stream(current.url, {
        discordPlayerCompatibility: true
      });

      const resource = createAudioResource(s.stream, {
        inputType: s.type ?? StreamType.Arbitrary,
        inlineVolume: true
      });

      this.player.play(resource);
      await logToDiscord(this.client, "INFO", `🎵 Lecture: **${current.title}**`);

    } catch (err) {
      // flux expiré → retente via getInfo
      const msg = String(err?.message || err);
      if (msg.includes("410") || msg.toLowerCase().includes("expired")) {
        await logToDiscord(this.client, "WARN", "Flux expiré (410). Retry via getInfo…");
        try {
          const info = await play.video_basic_info(current.url);
          const best = info?.format?.url || current.url;
          const s = await play.stream(best, { discordPlayerCompatibility: true });
          const resource = createAudioResource(s.stream, {
            inputType: s.type ?? StreamType.Arbitrary,
            inlineVolume: true
          });
          this.player.play(resource);
          return;
        } catch (err2) {
          await logToDiscord(this.client, "ERROR", "Retry getInfo échoué", err2);
        }
      }

      // Si complètement KO → passe au suivant
      await logToDiscord(this.client, "ERROR", `Impossible de jouer: ${current.title}`, err);
      return this._playNext();
    }
  }

  stop() {
    try { this.player.stop(true); } catch {}
    const conn = getVoiceConnection(this.guild.id);
    try { conn?.destroy(); } catch {}
    this.connection = null;
  }
}

export default getOrCreateGuildPlayer;
