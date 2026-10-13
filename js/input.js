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
    this.onSteer = null; // fired when the direction changes (used for haptics)
    this.onTouch = null; // fired on the first touch (reveals the D-pad on hybrid devices)

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
    surface.addEventListener('pointerdown', (e) => {
      sx = e.clientX; sy = e.clientY; tracking = true;
      if (e.pointerType === 'touch') this.onTouch?.();
    });
    surface.addEventListener('pointermove', (e) => {
      if (!tracking) return;
      const dx = e.clientX - sx, dy = e.clientY - sy;
      if (Math.hypot(dx, dy) < 24) return;
      const d = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'e' : 'w') : (dy > 0 ? 's' : 'n');
      if (d !== this.wanted) this.onSteer?.();
      this.wanted = d;
      sx = e.clientX; sy = e.clientY;
    });
    const end = () => { tracking = false; };
    surface.addEventListener('pointerup', end);
    surface.addEventListener('pointercancel', end);

    if (dpad) {
      // Treat the whole pad as a joystick: the direction follows the finger, so you can
      // slide between arrows without lifting it.
      const buttons = [...dpad.querySelectorAll('[data-dir]')];
      let active = null;
      const steer = (e) => {
        const r = dpad.getBoundingClientRect();
        const dx = e.clientX - (r.left + r.width / 2), dy = e.clientY - (r.top + r.height / 2);
        if (Math.hypot(dx, dy) < r.width * 0.12) return; // dead zone in the middle
        const d = Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'e' : 'w') : (dy > 0 ? 's' : 'n');
        if (d !== this.wanted) this.onSteer?.();
        this.wanted = d;
        buttons.forEach((b) => b.classList.toggle('on', b.dataset.dir === d));
      };
      dpad.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        active = e.pointerId;
        dpad.setPointerCapture(e.pointerId);
        steer(e);
      });
      dpad.addEventListener('pointermove', (e) => { if (e.pointerId === active) steer(e); });
      const release = (e) => {
        if (e.pointerId !== active) return;
        active = null;
        buttons.forEach((b) => b.classList.remove('on'));
      };
      dpad.addEventListener('pointerup', release);
      dpad.addEventListener('pointercancel', release);
    }
  }

  reset() { this.wanted = null; this.held = []; }
}
