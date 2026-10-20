// Tap / click input. Taps anywhere outside the menus go to the game, which picks the nearest
// target. On keyboards, 1–9 (and the numpad) hit the graves in reading order; P / Esc pause.
export class Input {
  constructor() {
    this.onTap = null;   // (clientX, clientY)
    this.onSpot = null;  // (graveIndex)
    this.onPause = null;

    addEventListener('pointerdown', (e) => {
      if (e.button > 0) return;
      if (e.target.closest?.('button, input, a, label, .screen')) return;
      this.onTap?.(e.clientX, e.clientY);
    });

    addEventListener('keydown', (e) => {
      if (e.target.tagName === 'INPUT') return;
      const n = e.code.match(/^(?:Digit|Numpad)([1-9])$/);
      if (n) {
        e.preventDefault();
        this.onSpot?.(Number(n[1]) - 1);
      } else if (e.code === 'Escape' || e.code === 'KeyP') {
        this.onPause?.();
      }
    });
  }

  reset() {}
}
