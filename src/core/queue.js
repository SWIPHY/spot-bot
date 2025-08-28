export class Queue {
  constructor() {
    this.items = [];
    this.index = -1;
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
