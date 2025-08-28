export class MusicQueue {
  constructor(guildId) {
    this.guildId = guildId;
    this.items = [];
    this.index = -1; // rien en cours
  }

  push(track) {
    this.items.push(track);
  }

  get current() {
    if (this.index < 0 || this.index >= this.items.length) return null;
    return this.items[this.index];
  }

  moveNext() {
    if (this.index + 1 < this.items.length) {
      this.index += 1;
      return true;
    }
    return false;
  }

  clear() {
    this.items = [];
    this.index = -1;
  }

  get length() {
    return this.items.length;
  }
}

