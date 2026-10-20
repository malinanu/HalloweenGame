// Builds the downloadable item: dist/pumpkin-smash-v<version>.zip
// containing only what a buyer needs (game, server, skins, assets, documentation).
//   npm run package
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
const NAME = `${pkg.name}-v${pkg.version}`;
const DIST = path.join(ROOT, 'dist');
const STAGE = path.join(DIST, NAME);

// Shipped files and folders (everything else — .git, .github, data/, .env, dist/, tools/ — stays out).
const INCLUDE = [
  'index.html', 'css', 'js', 'vendor', 'vendors', 'assets', 'documentation',
  'server.js', 'ecosystem.config.cjs', 'package.json', 'README.md',
];
const SKIP = new Set(['.DS_Store', 'Thumbs.db', 'marketing']); // marketing images are for the Envato listing, not the buyer

function copy(src, dst) {
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    fs.mkdirSync(dst, { recursive: true });
    for (const f of fs.readdirSync(src)) if (!SKIP.has(f)) copy(path.join(src, f), path.join(dst, f));
  } else {
    fs.copyFileSync(src, dst);
  }
}

fs.rmSync(STAGE, { recursive: true, force: true });
fs.mkdirSync(STAGE, { recursive: true });
for (const item of INCLUDE) {
  const src = path.join(ROOT, item);
  if (!fs.existsSync(src)) { console.error(`Missing ${item}`); process.exit(1); }
  copy(src, path.join(STAGE, item));
}

// the buyer's copy has no tools/ folder, so drop the packaging script from its package.json
const shippedPkg = { ...pkg, scripts: { start: pkg.scripts.start } };
fs.writeFileSync(path.join(STAGE, 'package.json'), `${JSON.stringify(shippedPkg, null, 2)}\n`);

const zip = path.join(DIST, `${NAME}.zip`);
fs.rmSync(zip, { force: true });
try {
  execFileSync('zip', ['-rq9', zip, NAME], { cwd: DIST });
} catch (err) {
  console.error('Could not run the "zip" command. The files are ready in', STAGE, '— zip that folder manually.');
  process.exit(1);
}
const mb = (fs.statSync(zip).size / 1048576).toFixed(1);
console.log(`Created ${path.relative(ROOT, zip)} (${mb} MB)`);
