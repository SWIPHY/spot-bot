export class MusicQueue {
  constructor(guildId) {
    this.guildId = guildId;
    this.tracks = [];
    this.index = -1; // -1 = rien en cours
  }
  get current() {
    return this.tracks[this.index] || null;
  }
  push(track) {
    this.tracks.push(track);
  }
  moveNext() {
    if (this.index + 1 < this.tracks.length) {
      this.index += 1;
      return true;
    }
    // fin de file -> reset
    this.clear();
    return false;
  }
  clear() {
    this.tracks = [];
    this.index = -1;
  }
}
