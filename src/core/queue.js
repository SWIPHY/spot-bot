export class Queue {
  constructor() {
    this.items = []; // [{ title, url, requestedBy }]
    this.index = -1; // position du "current" dans items
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

  toJSON() {
    return { index: this.index, items: this.items };
  }
}
