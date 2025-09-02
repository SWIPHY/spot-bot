import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  NoSubscriberBehavior,
  AudioPlayerStatus,
  getVoiceConnection,
  StreamType,
  demuxProbe, // <— permet de détecter automatiquement le type du flux
} from '@discordjs/voice';

import play from 'play-dl';

import { Queue } from './queue.js';
import { logToDiscord } from '../util/logger.js';
import { resolveTrack } from '../util/resolveTrack.js';

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

    // Enchaîner sur la suivante quand un titre se termine
    this.player.on(AudioPlayerStatus.Idle, () => this._playNext());

    this.player.on('error', (err) => {
      console.error(`AudioPlayer error: ${err?.message || err}`);
      logToDiscord(this.textChannel, `❌ Audio error: ${err?.message || err}`);
      this._playNext();
    });
  }

  /** Rejoint un salon vocal (ou récupère la connexion existante) */
  join(voiceChannel) {
    const existing = getVoiceConnection(this.guild.id);
    if (existing) {
      this.connection = existing;
      this.connection.subscribe(this.player);
      return this.connection;
    }

    this.connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: this.guild.id,
      adapterCreator: this.guild.voiceAdapterCreator,
      selfDeaf: true,
    });

    this.connection.subscribe(this.player);
    return this.connection;
  }

  /**
   * Ajoute un titre à la file et lance la lecture si besoin.
   * query peut être une URL YouTube ou des mots-clés.
   */
  async addAndPlay(query, requester = null) {
    // 1) Résoudre la requête => {title, url, stream}
    const track = await resolveTrack(query);
    if (!track) {
      throw new Error('Aucun résultat pour ta recherche.');
    }

    // 2) Mémoriser quelques métadonnées
    const item = {
      title: track.title,
      url: track.url,
      stream: track.stream, // Readable stream
      requester,
    };

    this.queue.push(item);
    // Si le player est déjà en lecture, on s’arrête là
    if (this.player.state.status !== AudioPlayerStatus.Idle) return;

    // Sinon on démarre
    await this._startCurrent();
  }

  /** Stoppe tout et vide la file */
  stop() {
    this.queue.clear();
    try {
      this.player.stop(true);
    } catch {}
  }

  /** Passe au titre suivant (si présent) */
  async skip() {
    if (this.queue.length() > 0) {
      // Arrête l’actuel; l’Idle event déclenchera _playNext()
      this.player.stop(true);
    }
  }

  /** Joue l’élément courant (tête de file) */
  async _startCurrent() {
    const current = this.queue.peek();
    if (!current) return;

    // Important : certains flux (play-dl, ytdl-core) sont déjà en Opus/WebM.
    // On laisse @discordjs/voice détecter le type grâce à demuxProbe.
    let probed, type;
    try {
      ({ stream: probed, type } = await demuxProbe(current.stream));
    } catch (e) {
      console.warn('[player] demuxProbe a échoué, tentative en StreamType.Arbitrary', e?.message);
      probed = current.stream;
      type = StreamType.Arbitrary;
    }

    const resource = createAudioResource(probed, { inputType: type });
    this.player.play(resource);

    if (this.textChannel) {
      const title = current.title || 'Unknown';
      logToDiscord(
        this.textChannel,
        `🎶 Now playing: **${title}**\n(${current.url})`
      );
    }
  }

  /** Enchaîne : retire la tête et lance la suivante */
  async _playNext() {
    // Retire le titre fini
    this.queue.shift();

    const next = this.queue.peek();
    if (!next) {
      if (this.textChannel) logToDiscord(this.textChannel, '✅ File terminée');
      return;
    }

    await this._startCurrent();
  }
}
