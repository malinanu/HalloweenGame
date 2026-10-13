// Grid maze with walls on cell edges. Row 0 is the far (top) side of the screen.
export const DIRS = {
  n: { dx: 0, dy: -1, opp: 's' },
  s: { dx: 0, dy: 1, opp: 'n' },
  e: { dx: 1, dy: 0, opp: 'w' },
  w: { dx: -1, dy: 0, opp: 'e' },
};
export const DIR_KEYS = ['n', 'e', 's', 'w'];

export class Maze {
  constructor(cols, rows, rng = Math.random) {
    this.cols = cols;
    this.rows = rows;
    this.rng = rng;
    this.cells = [];
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        this.cells.push({ x, y, n: true, e: true, s: true, w: true });
      }
    }
  }

  cell(x, y) {
    if (x < 0 || y < 0 || x >= this.cols || y >= this.rows) return null;
    return this.cells[y * this.cols + x];
  }

  open(x, y, d) {
    const c = this.cell(x, y);
    return !!c && !c[d] && !!this.cell(x + DIRS[d].dx, y + DIRS[d].dy);
  }

  openDirs(x, y) {
    return DIR_KEYS.filter((d) => this.open(x, y, d));
  }

  carve(x, y, d) {
    const c = this.cell(x, y);
    const n = this.cell(x + DIRS[d].dx, y + DIRS[d].dy);
    if (!c || !n) return;
    c[d] = false;
    n[DIRS[d].opp] = false;
  }

  generate(extraOpenings = 0.3) {
    const rng = this.rng;
    const seen = new Set();
    const stack = [this.cell(Math.floor(rng() * this.cols), Math.floor(rng() * this.rows))];
    seen.add(stack[0]);
    while (stack.length) {
      const c = stack[stack.length - 1];
      const options = DIR_KEYS.filter((d) => {
        const n = this.cell(c.x + DIRS[d].dx, c.y + DIRS[d].dy);
        return n && !seen.has(n);
      });
      if (!options.length) { stack.pop(); continue; }
      const d = options[Math.floor(rng() * options.length)];
      this.carve(c.x, c.y, d);
      const n = this.cell(c.x + DIRS[d].dx, c.y + DIRS[d].dy);
      seen.add(n);
      stack.push(n);
    }

    // Braid: remove most dead ends so the player can always run around a monster.
    for (const c of this.cells) {
      const walls = DIR_KEYS.filter((d) => c[d] && this.cell(c.x + DIRS[d].dx, c.y + DIRS[d].dy));
      if (DIR_KEYS.length - walls.length - this.borderCount(c) <= 1 && walls.length && rng() < 0.85) {
        this.carve(c.x, c.y, walls[Math.floor(rng() * walls.length)]);
      }
    }
    // A few extra random openings for more loops.
    const interior = this.cols * this.rows * extraOpenings * 0.5;
    for (let i = 0; i < interior; i++) {
      const c = this.cells[Math.floor(rng() * this.cells.length)];
      const d = DIR_KEYS[Math.floor(rng() * 4)];
      this.carve(c.x, c.y, d);
    }
    return this;
  }

  borderCount(c) {
    let n = 0;
    if (c.x === 0) n++;
    if (c.y === 0) n++;
    if (c.x === this.cols - 1) n++;
    if (c.y === this.rows - 1) n++;
    return n;
  }

  // Breadth-first distance map from (sx, sy). Used by monster AI and spawn placement.
  distances(sx, sy) {
    const dist = new Int16Array(this.cols * this.rows).fill(-1);
    const q = [sx, sy];
    dist[sy * this.cols + sx] = 0;
    for (let i = 0; i < q.length; i += 2) {
      const x = q[i], y = q[i + 1];
      const base = dist[y * this.cols + x];
      for (const d of DIR_KEYS) {
        if (!this.open(x, y, d)) continue;
        const nx = x + DIRS[d].dx, ny = y + DIRS[d].dy;
        const k = ny * this.cols + nx;
        if (dist[k] !== -1) continue;
        dist[k] = base + 1;
        q.push(nx, ny);
      }
    }
    return dist;
  }
}
