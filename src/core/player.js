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

import Queue from "./queue.js";                  // export default class Queue
import { logToDiscord } from "../util/logger.js"; // logToDiscord(level, title, fields?)

const players = new Map(); // guildId -> GuildPlayer

export function getOrCreateGuildPlayer(guild, textChannel = null) {
  let gp = players.get(guild.id);
  if (!gp) {
    gp = new GuildPlayer(guild, textChannel);
    players.set(guild.id, gp);
  } else if (textChannel) {
    gp.textChannel = textChannel;
  }
  return gp;
}
export default getOrCreateGuildPlayer;

class GuildPlayer {
  constructor(guild, textChannel = null) {
    this.guild = guild;
    this.textChannel = textChannel;

    this.queue = new Queue();      // gère items[], index, current()
    this.loop = "off";             // "off" | "one" | "all"
    this.volume = 1.0;

    this.voiceChannelId = null;
    this.connection = null;

    this.player = createAudioPlayer({
      behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
    });

    this.player.on("stateChange", (oldS, newS) => {
      if (oldS.status !== newS.status && newS.status === AudioPlayerStatus.Idle) {
        this._afterTrackEnded().catch((e) => this._error("afterTrack", e));
      }
    });

    this.player.on("error", (err) => this._error("AudioPlayer error", err));
  }

  // ---------------------------------------------------------------------------
  // Liaison channels

  setTextChannel(channel) {
    this.textChannel = channel;
  }

  setVoiceChannel(voiceChannel) {
    this.voiceChannelId = voiceChannel?.id ?? null;
  }

  /** Compat avec ton index.js */
  connect(voiceChannel) {
    this.setVoiceChannel(voiceChannel);
    return this._ensureConnection();
  }

  async _ensureConnection() {
    if (!this.voiceChannelId) throw new Error("Pas de salon vocal défini.");
    this.connection =
      getVoiceConnection(this.guild.id) ??
      joinVoiceChannel({
        channelId: this.voiceChannelId,
        guildId: this.guild.id,
        adapterCreator: this.guild.voiceAdapterCreator,
      });
    this.connection.subscribe(this.player);
  }

  // ---------------------------------------------------------------------------
  // File d’attente (API compat)

  /** Compat : ancien appel `setQueue(track)` */
  setQueue(track) {
    this.queue.push(track);
    return this.queue.items.length;
  }

  enqueue(track) {
    return this.setQueue(track);
  }

  /** Compat : ajoute plusieurs pistes d’un coup (playlists) */
  enqueueMany(tracks = []) {
    for (const t of tracks) this.queue.push(t);
    // si on est idle, démarrer
    if (this.player.state.status === AudioPlayerStatus.Idle) {
      return this._playNext();
    }
  }

  clear() {
    this.queue.clear();
  }

  stop() {
    try {
      this.player.stop(true);
    } catch {}
    this.clear();
  }

  // ---------------------------------------------------------------------------
  // Lecture

  async playOrEnqueue(track) {
    this.queue.push(track);
    await logToDiscord("INFO", "Ajouté à la file", {
      title: track.title ?? "Unknown",
    });

    if (this.player.state.status === AudioPlayerStatus.Idle) {
      await this._playNext();
    }
  }

  async _afterTrackEnded() {
    const q = this.queue;

    if (this.loop === "one") {
      return this._playIndex(q.index);
    }

    if (this.loop === "all") {
      if (!q.moveNext() && q.items.length > 0) q.index = 0;
      if (q.current()) return this._playIndex(q.index);
    } else {
      if (q.moveNext()) return this._playIndex(q.index);
    }

    await logToDiscord("INFO", "File terminée.");
  }

  async _playNext() {
    const q = this.queue;
    if (q.index < 0 && !q.moveNext()) {
      await logToDiscord("INFO", "File vide.");
      return;
    }
    return this._playIndex(q.index);
  }

  async _playIndex(i) {
    const track = this.queue.items[i];
    if (!track) return;

    await this._ensureConnection();

    try {
      // play-dl: URL YouTube (ou équivalent résolu) + options safe
      const s = await play.stream(track.url, {
        discordPlayerCompatibility: true,
        quality: 2,
      });

      const resource = createAudioResource(s.stream, {
        inputType: s.type ?? StreamType.Arbitrary,
        inlineVolume: true,
      });
      if (resource.volume) resource.volume.setVolume(this.volume);

      this.player.play(resource);

      await logToDiscord("INFO", "Lecture en cours", {
        title: track.title ?? "Unknown",
      });
    } catch (err) {
      this._error("play.stream", err);
      // skip ce titre et tenter le suivant
      if (this.queue.moveNext()) {
        return this._playIndex(this.queue.index);
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Logs

  _error(message, err) {
    const fields = { message: String(message) };
    if (err?.stack) fields.stack = "```\n" + err.stack + "\n```";
    else if (err) fields.error = String(err);
    logToDiscord("ERROR", "Player", fields);
  }
}
