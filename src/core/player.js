import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  NoSubscriberBehavior,
  AudioPlayerStatus,
  getVoiceConnection,
  StreamType,
} from "@discordjs/voice";
import play from "play-dl";
import { Queue } from "./queue.js"; // si tu n'as pas de fichier queue.js, remplace par une Map simple
import { logToDiscord } from "../util/logger.js";
import { ffmpegCmd } from "../util/ffmpeg.js";

// Map globale: guildId -> GuildPlayer
const players = new Map();

/** Retourne ou crée le lecteur pour un serveur */
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

class GuildPlayer {
  constructor(guild, textChannel) {
    this.guild = guild;
    this.textChannel = textChannel;
    this.queue = new Queue(); // doit au minimum exposer .enqueue(item), .dequeue(), .isEmpty()
    this.connection = null;

    this.player = createAudioPlayer({
      behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
    });

    this.player.on("stateChange", (oldS, newS) => {
      logToDiscord(
        "voice state",
        `idle: ${oldS.status} -> ${newS.status}`,
        { level: "info" }
      );
      if (
        oldS.status !== AudioPlayerStatus.Idle &&
        newS.status === AudioPlayerStatus.Idle
      ) {
        this._playNext().catch(e =>
          logToDiscord("play.next error", e?.stack || String(e), { level: "error" })
        );
      }
    });

    this.player.on("error", (err) => {
      logToDiscord("AudioPlayer error", err?.stack || String(err), { level: "error" });
      this._playNext().catch(() => {});
    });
  }

  /** Joindre un salon vocal */
  connect(voiceChannel) {
    if (this.connection) return this.connection;
    this.connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: this.guild.id,
      adapterCreator: this.guild.voiceAdapterCreator,
      selfDeaf: true,
    });
    this.connection.subscribe(this.player);
    return this.connection;
  }

  /** Ajouter et éventuellement lancer la lecture */
  async addAndPlay(track) {
    this.queue.enqueue(track);
    if (this.player.state.status === AudioPlayerStatus.Idle) {
      await this._playNext();
    }
  }

  /** Joue le prochain élément de la file */
  async _playNext() {
    const next = this.queue.dequeue();
    if (!next) return;

    try {
      // sécurité URL
      let url;
      try {
        url = new URL(next.url).toString();
      } catch {
        throw new TypeError("Invalid URL");
      }

      // Récupérer le flux YouTube
      const stream = await play.stream(url, {
        ffmpeg_path: ffmpegCmd(), // aide play-dl si besoin
        quality: 2,               // highestaudio
        discordPlayerCompatibility: true,
      });

      const resource = createAudioResource(stream.stream, {
        inputType: stream.type ?? StreamType.Arbitrary,
        inlineVolume: false,
      });

      this.player.play(resource);
      await logToDiscord("Now playing", `${next.title}\n${url}`, { level: "info" });
    } catch (err) {
      await logToDiscord("play.stream error", err?.stack || String(err), { level: "error" });
      return this._playNext();
    }
  }

  stop() {
    this.queue = new Queue();
    this.player.stop(true);
  }

  destroy() {
    this.stop();
    const c = getVoiceConnection(this.guild.id);
    if (c) c.destroy();
    players.delete(this.guild.id);
  }
}

export { GuildPlayer };
export default getOrCreateGuildPlayer;
