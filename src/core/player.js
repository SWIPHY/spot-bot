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

import { Queue } from "./queue.js";                // ta classe Queue (items, index, push, clear, moveNext, current)
import { logToDiscord } from "../util/logger.js";  // ton logger (ERROR / INFO)

/** cache des players par serveur */
const players = new Map(); // guildId -> GuildPlayer

/** Fabrique un AudioResource depuis une URL YouTube */
async function makeResource(url) {
  // 1) tentative directe
  try {
    const stream = await play.stream(url, {
      quality: 2, // auto
      discordPlayerCompatibility: true,
    });
    return createAudioResource(stream.stream, {
      inputType:
        stream.type === "opus" ? StreamType.Opus : StreamType.Arbitrary,
      inlineVolume: true,
    });
  } catch {
    // 2) fallback via info (évite l'erreur "Invalid URL" sur certains liens courts)
    const info = await play.video_info(url);
    const stream = await play.stream_from_info(info, {
      quality: 2,
      discordPlayerCompatibility: true,
    });
    return createAudioResource(stream.stream, {
      inputType:
        stream.type === "opus" ? StreamType.Opus : StreamType.Arbitrary,
      inlineVolume: true,
    });
  }
}

/** Player par serveur */
class GuildPlayer {
  constructor(guild, textChannel) {
    this.guild = guild;
    this.textChannel = textChannel;
    this.queue = new Queue();
    this.connection = null;

    this.player = createAudioPlayer({
      behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
    });

    // events player
    this.player.on("error", (err) => {
      logToDiscord("ERROR", `Audio error: ${err?.message || err}`, err);
      // en cas d’erreur, on tente le morceau suivant
      this._playNext().catch((e) =>
        logToDiscord("ERROR", "Erreur _playNext après audio error", e)
      );
    });

    this.player.on("stateChange", (oldS, newS) => {
      // debug léger si besoin
      // logToDiscord("INFO", `[voice] ${oldS.status} -> ${newS.status}`);
      if (
        oldS.status !== AudioPlayerStatus.Idle &&
        newS.status === AudioPlayerStatus.Idle
      ) {
        // fin d’un morceau -> suivant
        this._playNext().catch((e) =>
          logToDiscord("ERROR", "Erreur _playNext après Idle", e)
        );
      }
    });
  }

  /** Associe / met à jour le channel texte par défaut */
  setTextChannel(textChannel) {
    if (textChannel) this.textChannel = textChannel;
  }

  /** Connexion au salon vocal */
  connect(voiceChannel) {
    if (!voiceChannel) throw new Error("Salon vocal introuvable.");
    const conn =
      getVoiceConnection(this.guild.id) ||
      joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: voiceChannel.guild.id,
        adapterCreator: voiceChannel.guild.voiceAdapterCreator,
        selfDeaf: true,
      });

    this.connection = conn;
    this.connection.subscribe(this.player);
    return conn;
  }

  /** Lecture immédiate si possible, sinon mise en file */
  async playOrEnqueue(track) {
    if (!track || !track.url) {
      throw new Error("Track invalide (pas d’URL).");
    }

    // s'il n'y a rien en cours, on démarre
    if (this.player.state.status !== AudioPlayerStatus.Playing) {
      if (this.queue.current() == null) {
        this.queue.push(track);
        this.queue.moveNext(); // place l’index sur l’élément ajouté
      } else {
        this.queue.push(track);
      }
      await this._playCurrent();
      return;
    }

    // sinon on empile
    this.queue.push(track);
  }

  /** Ajoute plusieurs pistes d’un coup */
  enqueueMany(tracks) {
    if (!Array.isArray(tracks) || tracks.length === 0) return;
    for (const t of tracks) this.queue.push(t);

    if (this.player.state.status !== AudioPlayerStatus.Playing) {
      // si rien ne joue, lance immédiatement
      this._playNext().catch((e) =>
        logToDiscord("ERROR", "Erreur enqueueMany/_playNext", e)
      );
    }
  }

  /** Remplace toute la file */
  setQueue(tracks) {
    if (!Array.isArray(tracks)) return;

    if (typeof this.queue.clear === "function") this.queue.clear();
    else {
      this.queue.items = [];
      this.queue.index = -1;
    }

    for (const t of tracks) this.queue.push(t);

    this._playNext().catch((e) =>
      logToDiscord("ERROR", "Erreur setQueue/_playNext", e)
    );
  }

  /** Joue l’élément courant (selon queue.index) */
  async _playCurrent() {
    const t = this.queue.current();
    if (!t) {
      logToDiscord("INFO", "✅ File terminée.");
      return;
    }

    try {
      const resource = await makeResource(t.url);
      this.player.play(resource);
      logToDiscord("INFO", `🎵 Lecture: ${t.title || "Unknown"}`);
    } catch (err) {
      logToDiscord(
        "ERROR",
        `play.stream error: ${err?.message || err}. URL: ${t.url}`,
        err
      );
      // on tente le suivant
      await this._playNext();
    }
  }

  /** Passe au morceau suivant, ou stop si fin de file */
  async _playNext() {
    // si aucun courant, essaye de se positionner sur le premier
    if (this.queue.current() == null) {
      if (this.queue.items.length > 0) {
        this.queue.index = 0;
        return this._playCurrent();
      }
      logToDiscord("INFO", "✅ File terminée.");
      return;
    }

    // sinon avance
    if (this.queue.moveNext()) {
      return this._playCurrent();
    }

    // plus rien
    logToDiscord("INFO", "✅ File terminée.");
  }

  /** Stop + reset file */
  stop() {
    try {
      this.player.stop(true);
    } catch {}
    if (typeof this.queue.clear === "function") this.queue.clear();
    else {
      this.queue.items = [];
      this.queue.index = -1;
    }
  }
}

/** Export par défaut : récupère ou crée le player d’un serveur */
export default function getOrCreateGuildPlayer(guild, textChannel) {
  let gp = players.get(guild.id);
  if (!gp) {
    gp = new GuildPlayer(guild, textChannel);
    players.set(guild.id, gp);
  } else if (textChannel) {
    gp.setTextChannel(textChannel);
  }
  return gp;
}
