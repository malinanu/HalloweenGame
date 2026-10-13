import * as THREE from 'three';

function canvas(w, h) {
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  return [c, c.getContext('2d')];
}

// Label artwork for a savoury pack. Replace with real pack photography by
// dropping an image into assets/packs/<id>.png (see README) — this is the fallback.
export function packLabelTexture(product) {
  const [c, g] = canvas(256, 360);
  const grad = g.createLinearGradient(0, 0, 256, 360);
  grad.addColorStop(0, shade(product.color, 40));
  grad.addColorStop(0.55, product.color);
  grad.addColorStop(1, shade(product.color, -45));
  g.fillStyle = grad;
  g.fillRect(0, 0, 256, 360);

  // crimp stripes
  g.fillStyle = 'rgba(0,0,0,0.18)';
  for (let x = 0; x < 256; x += 10) { g.fillRect(x, 0, 5, 18); g.fillRect(x, 342, 5, 18); }

  // brand banner
  g.save();
  g.translate(128, 78);
  g.rotate(-0.08);
  g.fillStyle = '#fff';
  roundRect(g, -110, -30, 220, 60, 18);
  g.fill();
  g.fillStyle = '#d0121b';
  g.font = 'bold 44px "Luckiest Guy", "Arial Black", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  g.fillText('MALIBAN', 0, 3);
  g.restore();

  // chips
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

  // flavour name
  g.fillStyle = product.accent;
  g.strokeStyle = 'rgba(0,0,0,0.55)';
  g.lineWidth = 6;
  g.font = 'bold 36px "Luckiest Guy", "Arial Black", sans-serif';
  g.textAlign = 'center';
  g.textBaseline = 'middle';
  const words = product.name.toUpperCase().split(' ');
  const lines = words.length > 1 ? [words.slice(0, Math.ceil(words.length / 2)).join(' '), words.slice(Math.ceil(words.length / 2)).join(' ')] : words;
  lines.forEach((l, i) => {
    const y = 285 + (i - (lines.length - 1) / 2) * 38;
    g.strokeText(l, 128, y);
    g.fillText(l, 128, y);
  });
  g.fillStyle = 'rgba(255,255,255,0.85)';
  g.font = 'bold 16px Arial, sans-serif';
  g.fillText('SAVOURY', 128, 128);

  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
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
