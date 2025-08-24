export class MusicQueue {
constructor(guildId) {
this.guildId = guildId;
this.tracks = [];
this.loopMode = 'off'; // 'off' | 'track' | 'queue'
this.current = null;
}
enqueue(track) { this.tracks.push(track); }
dequeue() { return this.tracks.shift(); }
shuffle() { this.tracks = this.tracks.sort(() => Math.random() - 0.5); }
}