// PM2 config used by the CloudPanel deploy (.github/workflows/deploy.yml).
// Server-only settings (e.g. ADMIN_KEY) go in a `.env` file next to this one on the
// server; it is never committed or overwritten by deploys.
const fs = require('fs');
const path = require('path');

const env = {};
try {
  for (const line of fs.readFileSync(path.join(__dirname, '.env'), 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
    if (m) env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
} catch { /* no .env */ }

module.exports = {
  apps: [{
    name: 'pumpkin-smash',
    script: 'server.js',
    cwd: __dirname,
    env: {
      NODE_ENV: 'production',
      PORT: process.env.PORT || 3087,
      DATA_DIR: path.join(__dirname, 'data'),
      ...env,
    },
  }],
};
