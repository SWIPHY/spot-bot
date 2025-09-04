import {
  joinVoiceChannel,
  createAudioPlayer,
  createAudioResource,
  NoSubscriberBehavior,
  AudioPlayerStatus,
  VoiceConnectionStatus,
  entersState,
  getVoiceConnection,
  StreamType
} from "@discordjs/voice";
import play from "play-dl";
import { Queue } from "./queue.js";

// Map globale guildId -> player
const players = new Map();

export default function getOrCreateGuildPlayer(guild, textChannel, logger) {
  let gp = players.get(guild.id);
  if (!gp) {
    gp = new GuildPlayer(guild, textChannel, logger);
    players.set(guild.id, gp);
  } else if (textChannel) {
    gp.textChannel = textChannel;
  }
  return gp;
}

export class GuildPlayer {
  constructor(guild, textChannel, logger) {
    this.guild = guild;
    this.textChannel = textChannel ?? null;
    this.logger = logger;
    this.queue = new Queue();
    this.connection = null;

    this.player = createAudioPlayer({
      behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
    });

    this.player.on("stateChange", (oldS, newS) => {
      if (oldS.status !== newS.status) {
        this.logger?.info(`[voice] ${oldS.status} -> ${newS.status}`);
      }
      if (oldS.status === AudioPlayerStatus.Playing && newS.status === AudioPlayerStatus.Idle) {
        this._playNext().catch(() => {});
      }
    });

    this.player.on("error", (err) => {
      this.logger?.error({ title: "Audio error", desc: err?.message || String(err) });
      this._playNext().catch(() => {});
    });
  }

  async join(voiceChannel) {
    try {
      if (this.connection?.joinConfig?.channelId === voiceChannel.id) return this.connection;

      const prev = getVoiceConnection(this.guild.id);
      if (prev) prev.destroy();

      const conn = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: voiceChannel.guild.id,
        adapterCreator: voiceChannel.guild.voiceAdapterCreator,
        selfDeaf: true
      });

      await entersState(conn, VoiceConnectionStatus.Ready, 10_000);
      conn.subscribe(this.player);

      conn.on(VoiceConnectionStatus.Disconnected, async () => {
        try {
          await Promise.race([
            entersState(conn, VoiceConnectionStatus.Signalling, 5_000),
            entersState(conn, VoiceConnectionStatus.Connecting, 5_000),
          ]);
        } catch {
          conn.destroy();
        }
      });

      this.connection = conn;
      this.logger?.info(`🔌 Joint ${voiceChannel.name}`);
      return conn;
    } catch (e) {
      this.logger?.error({ title: "join error", desc: String(e?.message || e) });
      throw e;
    }
  }

  async enqueue(track, requestedBy) {
    this.queue.push({ ...track, requestedBy });
    if (this.player.state.status === AudioPlayerStatus.Idle && this.queue.index < 0) {
      this.queue.index = 0;
      await this._play(this.queue.current);
    } else {
      this.logger?.info(`➕ Queue: ${track.title}`);
    }
  }

  async _playNext() {
    if (!this.queue.moveNext()) {
      this.player.stop(true);
      this.logger?.info("⏹️ Fin de file");
      return;
    }
    const t = this.queue.current;
    await this._play(t);
  }

  async _play(track) {
    if (!track?.url) {
      this.logger?.warn("Track invalide");
      return this._playNext();
    }

    try {
      const s = await play.stream(track.url, { quality: 2, discordPlayerCompatibility: true });
      const resource = createAudioResource(s.stream, {
        inputType: s.type ?? StreamType.Arbitrary,
        inlineVolume: true,
      });
      this.player.play(resource);
      const msg = `🎵 Now playing: **${track.title}**`;
      this.logger?.info(msg);
      if (this.textChannel) this.textChannel.send(msg).catch(() => {});
      return;
    } catch (e) {
      this.logger?.warn(`stream failed: ${e?.message || e}`);
    }

    this.logger?.error({ title: "Lecture impossible", desc: track.title });
    await this._playNext();
  }

  stop() {
    this.queue.clear();
    this.player.stop(true);
    const c = getVoiceConnection(this.guild.id);
    if (c) c.destroy();
  }

  destroy() {
    this.stop();
    players.delete(this.guild.id);
  }
}
