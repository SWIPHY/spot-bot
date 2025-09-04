export class Queue {
  constructor() {
    this.items = [];   // Tableau de morceaux
    this.index = -1;   // Position du morceau courant
  }

  // Retourne le morceau en cours
  get current() {
    return this.items[this.index] || null;
  }

  // Ajoute un morceau à la file
  push(track) {
    this.items.push(track);
  }

  // Passe au morceau suivant (true si ok, false si fin de file)
  moveNext() {
    if (this.index + 1 < this.items.length) {
      this.index++;
      return true;
    }
    return false;
  }

  // Passe au morceau précédent (true si ok, false si début de file)
  movePrevious() {
    if (this.index - 1 >= 0) {
      this.index--;
      return true;
    }
    return false;
  }

  // Réinitialise la file
  clear() {
    this.items = [];
    this.index = -1;
  }

  // Va directement à une position donnée
  jump(pos) {
    if (pos >= 0 && pos < this.items.length) {
      this.index = pos;
      return true;
    }
    return false;
  }

  // Supprime un élément à une position donnée
  remove(pos) {
    if (pos >= 0 && pos < this.items.length) {
      this.items.splice(pos, 1);
      if (this.index >= this.items.length) {
        this.index = this.items.length - 1;
      }
      return true;
    }
    return false;
  }

  // Vérifie si la file est vide
  isEmpty() {
    return this.items.length === 0;
  }
}
