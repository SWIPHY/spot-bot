import {
joinVoiceChannel,
createAudioPlayer,
createAudioResource,
AudioPlayerStatus,
NoSubscriberBehavior,
entersState,
VoiceConnectionStatus,
} from '@discordjs/voice';
import { stream } from 'play-dl';


export class GuildPlayer {
constructor(guild, queue, textChannel) {
this.guild = guild;
this.queue = queue;
this.textChannel = textChannel;
this.connection = null;
this.player = createAudioPlayer({
behaviors: { noSubscriber: NoSubscriberBehavior.Pause },
});
this.player.on(AudioPlayerStatus.Idle, () => this.next());
this.player.on('error', (e) => {
this.textChannel?.send(`❌ Erreur player: ${e.message}`);
this.next();
});
}


async connect(voiceChannel) {
this.connection = joinVoiceChannel({
channelId: voiceChannel.id,
guildId: voiceChannel.guild.id,
adapterCreator: voiceChannel.guild.voiceAdapterCreator,
selfDeaf: true,
});
await entersState(this.connection, VoiceConnectionStatus.Ready, 15_000);
this.connection.subscribe(this.player);
}


async play(track) {
try {
const s = await stream(track.url, { quality: 2 }); // audio only
const resource = createAudioResource(s.stream, { inputType: s.type });
this.player.play(resource);
this.queue.current = track;
await this.textChannel?.send(`▶️ **Playing:** ${track.title}`);
} catch (e) {
await this.textChannel?.send(`⚠️ Skip (stream error) → ${track.title}`);
this.next();
}
}


async next() {
const { loopMode, current } = this.queue;
if (loopMode === 'track' && current) {
return this.play(current);
}
if (loopMode === 'queue' && current) {
this.queue.enqueue(current);
}
const next = this.queue.dequeue();
if (!next) {
this.queue.current = null;
return this.textChannel?.send('✅ Queue terminée.');
}
return this.play(next);
}
}