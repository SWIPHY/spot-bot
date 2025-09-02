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

const players = new Map(); // guildId -> GuildPlayer

export class GuildPlayer {
  constructor(guild, textChannel) {
    this.guild = guild;
    this.textChannel = textChannel || null;
    this.queue = [];
    this.connection = null;

    this.player = createAudioPlayer({
      behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
    });

    this.player.on("stateChange", (o, n) => {
      console.log(`[voice] ${o.status} -> ${n.status}`);
      if (o.status !== AudioPlayerStatus.Idle && n.status === AudioPlayerStatus.Idle) {
        this._playNext().catch(() => {});
      }
    });

    this.player.on("error", (err) => {
      console.error(`[AudioPlayer error] ${err.message || err}`);
      logToDiscord("AudioPlayer error", err?.stack || String(err), { level: "error" });
      this._playNext().catch(() => {});
    });
  }

  async join(voiceChannel) {
    if (this.connection) return this.connection;
    this.connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: voiceChannel.guild.id,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      selfDeaf: true
    });
    this.connection.subscribe(this.player);
    return this.connection;
  }

  enqueue(track) {
    this.queue.push(track);
    if (this.player.state.status === AudioPlayerStatus.Idle) {
      this._playNext().catch(() => {});
    }
  }

  async _playNext() {
    const next = this.queue.shift();
    if (!next) return;

    try {
      // stream via play-dl
      const stream = await play.stream(next.url, { discordPlayerCompatibility: true });
      const resource = createAudioResource(stream.stream, {
        inputType: stream.type ?? StreamType.Arbitrary,
        inlineVolume: true
      });
      resource.volume?.setVolume(0.25);

      this.player.play(resource);
      if (this.textChannel) {
        await this.textChannel.send(`🎶 Lecture : **${next.title}**\n${next.url}`);
      }
    } catch (err) {
      console.error(`[play] stream error: ${err?.message || err}`);
      await logToDiscord("play.stream error", err?.stack || String(err), { level: "error" });
      // essaie le morceau suivant
      return this._playNext();
    }
  }

  stop() {
    this.queue = [];
    this.player.stop(true);
    const conn = getVoiceConnection(this.guild.id);
    conn?.destroy();
    this.connection = null;
  }
}

/** Récupère (ou crée) le lecteur pour une guilde */
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

// export par défaut pour compat avec `import getOrCreateGuildPlayer from ...`
export default getOrCreateGuildPlayer;
