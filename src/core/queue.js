export class MusicQueue {
  constructor(guildId) {
    this.guildId = guildId;
    this.items = [];         // { title, url, duration, requestedBy }
    this.index = -1;         // pointeur sur le morceau courant
    this.loop = "off";       // "off" | "track" | "queue"
  }

  get current() { return this.items[this.index] || null; }
  get hasNext() { return this.index + 1 < this.items.length; }

  push(track) { this.items.push(track); }
  unshift(track) { this.items.unshift(track); }
  nextIndex() {
    if (this.loop === "track" && this.current) return this.index; // rejoue le même
    if (this.index + 1 < this.items.length) return this.index + 1;
    if (this.loop === "queue" && this.items.length) return 0;
    return -1;
  }
  moveNext() {
    const ni = this.nextIndex();
    this.index = ni;
    return ni !== -1;
  }
  shuffle() {
    for (let i = this.items.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this.items[i], this.items[j]] = [this.items[j], this.items[i]];
    }
  }
  clear() {
    this.items = [];
    this.index = -1;
    this.loop = "off";
  }
}
