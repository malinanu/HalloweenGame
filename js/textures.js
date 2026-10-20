import * as THREE from 'three';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

// Drawn artwork for one collectible, in the layout its shape needs. An item "image" in the
// vendor file replaces this entirely (see game.js).
export function itemTexture(item, vendor) {
  const shape = vendor.item.shape;
  if (shape === 'can') return finish(canLabel(item, vendor.label));
  if (shape === 'coin') return finish(coinFace(item, vendor.label));
  if (shape === 'gift') return finish(giftWrap(item));
  return finish(packLabel(item, vendor.label, shape === 'bag'));
}

function finish(c) {
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

// Fit text into maxWidth by shrinking the font.
function fitFont(g, text, maxWidth, size, min = 14) {
  do { g.font = `bold ${size}px "Luckiest Guy", "Arial Black", sans-serif`; } while (g.measureText(text).width > maxWidth && --size > min);
}

function outlined(g, text, x, y, fill, stroke = 'rgba(0,0,0,0.55)', width = 6) {
  g.fillStyle = fill;
  g.strokeStyle = stroke;
  g.lineWidth = width;
  g.strokeText(text, x, y);
  g.fillText(text, x, y);
}

function splitLines(text) {
  const words = text.toUpperCase().split(' ');
  if (words.length < 2) return words;
  const half = Math.ceil(words.length / 2);
  return [words.slice(0, half).join(' '), words.slice(half).join(' ')];
}

// Front/back label for bags and boxes (portrait).
function packLabel(item, label, chips) {
  const [c, g] = canvas(256, 360);
  const grad = g.createLinearGradient(0, 0, 256, 360);
  grad.addColorStop(0, shade(item.color, 40));
  grad.addColorStop(0.55, item.color);
  grad.addColorStop(1, shade(item.color, -45));
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 360);

  if (chips) { // crimp stripes
    g.fillStyle = 'rgba(0,0,0,0.18)';
    for (let x = 0; x < 256; x += 10) { g.fillRect(x, 0, 5, 18); g.fillRect(x, 342, 5, 18); }
  }

  // brand banner
  g.save();
  g.translate(128, 78);
  g.rotate(-0.08);
  g.fillStyle = '#fff';
  roundRect(g, -110, -30, 220, 60, 18);
  g.fill();
  g.fillStyle = shade(item.color, -60);
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  fitFont(g, label.brand, 200, 44, 16);
  g.fillText(label.brand, 0, 3);
  g.restore();

  if (chips) {
    for (let i = 0; i < 7; i++) {
      const x = 60 + (i % 4) * 45 + (i > 3 ? 22 : 0);
      const y = 175 + (i > 3 ? 42 : 0);
      g.save();
      g.translate(x, y);
      g.rotate(i * 0.9);
      g.fillStyle = '#f7d27a';
      g.strokeStyle = '#c98f2a';
      g.lineWidth = 3;
      g.beginPath();
      g.ellipse(0, 0, 26, 18, 0, 0, Math.PI * 2);
      g.fill();
      g.stroke();
      g.restore();
    }
  } else {
    stars(g, 128, 195, 70, item.accent);
  }

  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const lines = splitLines(item.name);
  lines.forEach((l, i) => {
    fitFont(g, l, 230, 36);
    outlined(g, l, 128, 285 + (i - (lines.length - 1) / 2) * 38, item.accent);
  });
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.font = 'bold 16px Arial, sans-serif';
  g.fillText(label.tagline, 128, 128);
  return c;
}

// Wrap-around label for cans: printed twice so it reads from either side.
function canLabel(item, label) {
  const [c, g] = canvas(512, 256);
  const grad = g.createLinearGradient(0, 0, 0, 256);
  grad.addColorStop(0, shade(item.color, 50));
  grad.addColorStop(0.5, item.color);
  grad.addColorStop(1, shade(item.color, -50));
  g.fillStyle = grad;
  g.fillRect(0, 0, 512, 256);
  g.fillStyle = 'rgba(255,255,255,0.18)'; // bubbles
  for (let i = 0; i < 40; i++) {
    g.beginPath();
    g.arc((i * 97) % 512, (i * 53) % 256, 3 + (i % 5) * 2, 0, Math.PI * 2);
    g.fill();
  }
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  for (const x of [128, 384]) {
    g.fillStyle = 'rgba(255,255,255,0.92)';
    roundRect(g, x - 100, 40, 200, 64, 16);
    g.fill();
    g.fillStyle = shade(item.color, -60);
    fitFont(g, label.brand, 180, 48, 16);
    g.fillText(label.brand, x, 74);
    fitFont(g, item.name.toUpperCase(), 220, 40);
    outlined(g, item.name.toUpperCase(), x, 150, item.accent);
    g.fillStyle = 'rgba(255,255,255,0.8)';
    g.font = 'bold 16px Arial, sans-serif';
    g.fillText(label.tagline, x, 200);
  }
  return c;
}

// Coin face: metallic disc in the item colour with the brand around the item name.
function coinFace(item, label) {
  const [c, g] = canvas(256, 256);
  const grad = g.createRadialGradient(100, 90, 10, 128, 128, 128);
  grad.addColorStop(0, shade(item.color, 90));
  grad.addColorStop(0.6, item.color);
  grad.addColorStop(1, shade(item.color, -60));
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 256);
  g.strokeStyle = shade(item.color, -70);
  g.lineWidth = 8;
  g.beginPath();
  g.arc(128, 128, 104, 0, Math.PI * 2);
  g.stroke();
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillStyle = item.accent;
  fitFont(g, label.brand, 150, 26, 12);
  g.fillText(label.brand, 128, 68);
  const name = item.name.toUpperCase();
  fitFont(g, name, 170, 42);
  outlined(g, name, 128, 132, item.accent, shade(item.color, -70), 5);
  g.fillStyle = item.accent;
  g.font = 'bold 18px Arial, sans-serif';
  g.fillText(label.tagline, 128, 186);
  return c;
}

// Gift wrap: polka dots in the accent colour with the item name.
function giftWrap(item) {
  const [c, g] = canvas(256, 256);
  g.fillStyle = item.color;
  g.fillRect(0, 0, 256, 256);
  g.fillStyle = item.accent;
  g.globalAlpha = 0.35;
  for (let y = 16; y < 256; y += 40) for (let x = (y / 40) % 2 ? 36 : 16; x < 256; x += 40) { g.beginPath(); g.arc(x, y, 7, 0, Math.PI * 2); g.fill(); }
  g.globalAlpha = 1;
  return c;
}

function stars(g, cx, cy, r, color) {
  g.fillStyle = color;
  g.globalAlpha = 0.85;
  for (let i = 0; i < 5; i++) {
    const a = (i / 5) * Math.PI * 2;
    star(g, cx + Math.cos(a) * r * 0.55, cy + Math.sin(a) * r * 0.45, 12 + (i % 2) * 6);
  }
  star(g, cx, cy, 26);
  g.globalAlpha = 1;
}

function star(g, x, y, r) {
  g.beginPath();
  for (let i = 0; i < 10; i++) {
    const a = (i / 10) * Math.PI * 2 - Math.PI / 2;
    const rr = i % 2 ? r * 0.45 : r;
    g.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr);
  }
  g.closePath();
  g.fill();
}

export function pumpkinFaceTexture(variant = 0) {
  const [c, g] = canvas(256, 256);
  g.fillStyle = '#ffdd55';
  g.shadowColor = '#ff9900';
  g.shadowBlur = 18;
  const tri = (x, y, s, flip = 1) => {
    g.beginPath();
    g.moveTo(x, y - s * flip);
    g.lineTo(x - s, y + s * 0.7 * flip);
    g.lineTo(x + s, y + s * 0.7 * flip);
    g.closePath();
    g.fill();
  };
  tri(80, 95, 30);
  tri(176, 95, 30);
  if (variant % 2 === 0) tri(128, 135, 14);
  g.beginPath();
  g.moveTo(40, 160);
  const teeth = 6;
  for (let i = 0; i <= teeth; i++) {
    const x = 40 + (176 / teeth) * i;
    g.lineTo(x, 160 + (i % 2 ? 22 : 0) + (variant % 2 ? 6 : 0));
  }
  g.quadraticCurveTo(128, 260, 40, 160);
  g.fill();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function radialTexture(inner = 'rgba(255,255,255,1)', outer = 'rgba(255,255,255,0)') {
  const [c, g] = canvas(128, 128);
  const grad = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grad.addColorStop(0, inner);
  grad.addColorStop(1, outer);
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const t = new THREE.CanvasTexture(c);
  return t;
}

function roundRect(g, x, y, w, h, r) {
  g.beginPath();
  g.moveTo(x + r, y);
  g.arcTo(x + w, y, x + w, y + h, r);
  g.arcTo(x + w, y + h, x, y + h, r);
  g.arcTo(x, y + h, x, y, r);
  g.arcTo(x, y, x + w, y, r);
  g.closePath();
}

function shade(hex, amt) {
  const n = parseInt(hex.slice(1), 16);
  const clamp = (v) => Math.max(0, Math.min(255, v));
  const r = clamp((n >> 16) + amt), gg = clamp(((n >> 8) & 255) + amt), b = clamp((n & 255) + amt);
  return `rgb(${r},${gg},${b})`;
}
