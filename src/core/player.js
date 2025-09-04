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
import { logToDiscord } from "../util/logger.js";

export class Queue {
  constructor() {
    this.items = [];   // { title, url, requestedBy }
    this.index = -1;   // pointeur sur l’élément en cours
  }
  get current() {
    return this.items[this.index] || null;
  }
  push(t) {
    this.items.push(t);
  }
  moveNext() {
    if (this.index + 1 < this.items.length) {
      this.index++;
      return true;
    }
    return false;
  }
  clear() {
    this.items = [];
    this.index = -1;
  }
}

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

export default getOrCreateGuildPlayer;

export class GuildPlayer {
  constructor(guild, textChannel) {
    this.guild = guild;
    this.textChannel = textChannel;

    this.queue = new Queue();
    this.connection = null;

    this.player = createAudioPlayer({
      behaviors: {
        // On ne coupe pas quand il n’y a plus d’auditeurs
        noSubscriber: NoSubscriberBehavior.Play,
      },
    });

    // Abonnements d’état pour enchaîner / loguer
    this.player.on("stateChange", (oldS, newS) => {
      logToDiscord(
        this.textChannel,
        `[voice] ${oldS.status} -> ${newS.status}`
      );
      if (newS.status === AudioPlayerStatus.Idle) {
        this._playNext().catch((e) =>
          this._error(`idle->playNext error`, e)
        );
      }
    });

    this.player.on("error", (err) => {
      this._error(`AudioPlayer error: ${err?.message || err}`, err);
      this._playNext().catch(() => {});
    });
  }

  async ensureJoin(voiceChannel) {
    // Si déjà connecté au bon salon, on garde
    if (this.connection?.joinConfig?.channelId === voiceChannel.id) return;

    // Déconnexion précédente si besoin
    getVoiceConnection(this.guild.id)?.destroy();

    this.connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: this.guild.id,
      adapterCreator: this.guild.voiceAdapterCreator,
      selfDeaf: true,
      selfMute: false,
    });

    // Abonnement player -> connection (indispensable)
    this.connection.subscribe(this.player);
  }

  /**
   * Ajoute et démarre si nécessaire
   */
  async playOrEnqueue(track, voiceChannel) {
    await this.ensureJoin(voiceChannel);

    this.queue.push(track);
    logToDiscord(this.textChannel, `➕ Ajouté à la file: **${track.title}**`);

    // Si rien ne joue encore, on démarre
    if (this.player.state.status === AudioPlayerStatus.Idle && this.queue.index < 0) {
      await this._playNext();
    }
  }

  async _playNext() {
    // Avance le pointeur (ou stop si plus rien)
    const hasNext = this.queue.moveNext();
    if (!hasNext) {
      logToDiscord(this.textChannel, "✅ File terminée.");
      this.queue.clear();
      this.player.stop(true);
      return;
    }

    const current = this.queue.current;
    if (!current) return;

    logToDiscord(this.textChannel, `🎵 Now playing: **${current.title}**`);

    try {
      // 1) stream via play-dl (cookies déjà set dans index.js)
      const stream = await play.stream(current.url, {
        quality: 2, // auto/best available audio
        discordPlayerCompatibility: true,
      });

      // 2) ressource audio
      const resource = createAudioResource(stream.stream, {
        inputType: stream.type ?? StreamType.Arbitrary,
        inlineVolume: true,
      });

      // 3) lecture
      this.player.play(resource);
    } catch (err) {
      this._error(`play.stream error`, err);
      // Passe au suivant en cas d’erreur
      return this._playNext();
    }
  }

  stop() {
    this.queue.clear();
    this.player.stop(true);
  }

  _error(prefix, err) {
    const msg = err?.stack || err?.message || String(err);
    logToDiscord(this.textChannel, `❌ ERROR\n${prefix}\n\`\`\`\n${msg}\n\`\`\``);
  }
}
