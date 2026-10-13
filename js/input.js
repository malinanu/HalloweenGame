// Keyboard and swipe input. Produces a single "wanted" direction.
const KEYS = {
  ArrowUp: 'n', KeyW: 'n', ArrowDown: 's', KeyS: 's',
  ArrowLeft: 'w', KeyA: 'w', ArrowRight: 'e', KeyD: 'e',
};

export class Input {
  constructor() {
    this.wanted = null;
    this.held = [];
    this.onPause = null;
    this.onSteer = null; // fired when the direction changes (used for haptics)

    addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      const d = KEYS[e.code];
      if (d) {
        e.preventDefault();
        this.held = this.held.filter((h) => h !== d);
        this.held.push(d);
        this.wanted = d;
      } else if ((e.code === 'Escape' || e.code === 'KeyP') && this.onPause) {
        this.onPause();
      }
    });
    addEventListener('keyup', (e) => {
      const d = KEYS[e.code];
      if (!d) return;
      this.held = this.held.filter((h) => h !== d);
      // keep the last direction buffered so the player keeps running (classic maze feel)
      if (this.held.length) this.wanted = this.held[this.held.length - 1];
    });

    // Swipe anywhere on screen (touch, pen or mouse drag). Each 24px of drag picks a direction,
    // and it re-arms while the finger keeps moving, so you can steer round corners without lifting.
    let sx = 0, sy = 0, tracking = null;
    const ignore = (e) => e.target.closest?.('button, input, a, label, .screen');
    addEventListener('pointerdown', (e) => {
      if (ignore(e)) return;
      sx = e.clientX; sy = e.clientY; tracking = e.pointerId;
    });
    addEventListener('pointermove', (e) => {
      if (e.pointerId !== tracking) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.hypot(dx, dy) < 24) return;
      const d = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'e' : 'w') : (dy > 0 ? 's' : 'n');
      if (d !== this.wanted) this.onSteer?.();
      this.wanted = d;
      sx = e.clientX; sy = e.clientY;
    });
    const end = (e) => { if (e.pointerId === tracking) tracking = null; };
    addEventListener('pointerup', end);
    addEventListener('pointercancel', end);
  }

  reset() { this.wanted = null; this.held = []; }
}
