// Keyboard, swipe and on-screen D-pad input. Produces a single "wanted" direction.
const KEYS = {
  ArrowUp: 'n', KeyW: 'n', ArrowDown: 's', KeyS: 's',
  ArrowLeft: 'w', KeyA: 'w', ArrowRight: 'e', KeyD: 'e',
};

export class Input {
  constructor(surface, dpad) {
    this.wanted = null;
    this.held = [];
    this.onPause = null;

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

    let sx = 0, sy = 0, tracking = false;
    surface.addEventListener('pointerdown', (e) => { sx = e.clientX; sy = e.clientY; tracking = true; });
    surface.addEventListener('pointermove', (e) => {
      if (!tracking) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.hypot(dx, dy) < 24) return;
      this.wanted = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'e' : 'w') : (dy > 0 ? 's' : 'n');
      sx = e.clientX; sy = e.clientY;
    });
    const end = () => { tracking = false; };
    surface.addEventListener('pointerup', end);
    surface.addEventListener('pointercancel', end);

    if (dpad) {
      dpad.querySelectorAll('[data-dir]').forEach((b) => {
        b.addEventListener('pointerdown', (e) => {
          e.preventDefault();
          this.wanted = b.dataset.dir;
          b.classList.add('on');
        });
        const off = () => b.classList.remove('on');
        b.addEventListener('pointerup', off);
        b.addEventListener('pointerleave', off);
      });
    }
  }

  reset() { this.wanted = null; this.held = []; }
}
