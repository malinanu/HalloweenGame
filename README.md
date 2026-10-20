# 🎃 Halloween Maze — white-label promo game

A Halloween maze-runner web game built to be **re-skinned for any vendor**. Players enter a
haunted dungeon maze, collect the vendor's items, dodge five skeleton monsters and submit their
score to a daily / weekly / all-time leaderboard to compete for prizes.

The game name, logo, colours, what players collect (and its 3D shape), and the prize text all
come from one file per vendor: `vendors/<id>/vendor.json`. Three example skins are included:

| Vendor id | Game name | Players collect | Shape |
| --- | --- | --- | --- |
| `spooky` (default) | Spooky Maze Runner | treat bags | bag |
| `example-drinks` | Fizz Fright Night | cans | can |
| `example-rewards` | Reward Rush | reward coins | coin |

**What a vendor gets:** a branded Halloween game that works on phones and desktops, swipe
controls and a built-in tutorial, skill-based scoring (combos, near misses, full sets),
daily/weekly/all-time leaderboards with one entry per mobile number, and a one-click winners
CSV for the prize team.

Runs in any modern browser on phones, tablets and desktops (Three.js / WebGL, no build step).

## How to play

1. Enter the maze (through the green portal).
2. Collect as many of the vendor's items as possible.
3. Avoid the five characters (Warrior, Rogue, Mage, Minion and the Ghost).
4. Survive until time runs out.
5. Submit your score to the leaderboard.
6. Compete to win prizes.

**Controls:** arrow keys / WASD on desktop · `P` / `Esc` to pause.

**Mobile:** swipe anywhere on the screen to steer — keep your finger moving to turn corners
without lifting it. There are no on-screen buttons, so the maze uses the whole screen (tall
phones get extra maze rows). Phones get vibration feedback, go fullscreen and keep the screen
awake during a round (where the browser allows it). Rendering is automatically lighter on phones.

**Tutorial:** a short 4-card "how to play" (swipe, packs, skeletons, 60 seconds) appears
before a player's first game; on phones the first card lets them practise a swipe. It can be
reopened any time from **How to play** on the start screen.

### Rules

| Rule | Value |
| --- | --- |
| Round length | 60 seconds |
| Lives | 3 (touching a monster removes one, then 2 s of invulnerability) |
| Game ends | when time runs out or all lives are lost |

### Scoring

The brief's base points plus skill points, so scores spread out and players rarely tie:

| Source | Points |
| --- | --- |
| Each pack | 10 |
| Combo — packs grabbed within 2.5 s of each other | ×1.25 → ×1.5 → ×1.75 → ×2 (max) |
| Speed — a pack grabbed soon after it appears | +5, dropping by 1 every 2 s it lies there |
| Near miss — a skeleton gets close and you escape without being touched (once per skeleton per 3 s) | +5 |
| Every full set — one of each of the five kinds (repeatable) | +50 |
| Every second survived | +2 |
| Each life left when time runs out | +20 |

**Ranking is always unique:** score → most packs → most lives left → longest survival →
whoever submitted that score first. All numbers live in `SCORING` in [`js/config.js`](js/config.js);
the server imports the same file, so changing them there updates validation too.

**One entry per player:** submitting requires a Sri Lankan mobile number
(`07X XXX XXXX`, `+94 7X…` etc.). Each number has one leaderboard entry — their best score
for the period — shown under their latest name with the last digits masked (`SpookySam ••567`)
so players with the same name can be told apart. Players can return and improve their score.

## Running it

Requires Node.js 24 LTS (no `npm install` needed — zero dependencies).

```bash
npm start            # or: node server.js
# open http://localhost:8080
```

Environment variables:

| Variable | Default | Purpose |
| --- | --- | --- |
| `PORT` | `8080` | HTTP port |
| `DATA_DIR` | `./data` | Where `scores.json` is stored |
| `TZ_OFFSET_MIN` | `330` | Time zone for daily/weekly resets (330 = Sri Lanka, UTC+05:30). Weeks start Monday. |
| `ADMIN_KEY` | *(unset)* | Enables the winners export (see below) |
| `VENDOR` | `spooky` | Which vendor skin this deployment shows (`vendors/<id>/vendor.json`) |

Append `?low` to the URL to force the low-graphics mode (the game also switches to it
automatically on slow devices).

### Static hosting

The game also works as plain static files (GitHub Pages, Netlify, S3…). Without `server.js`
the leaderboard falls back to scores saved in the player's own browser, so for the real
campaign deploy it with the Node server (any Node host: Render, Railway, a VPS, etc.) and
put it behind HTTPS.

## Deploying to CloudPanel (GitHub Actions)

[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml) deploys on every push to `main`
(or manually from **Actions → Deploy to CloudPanel → Run workflow**). It syntax-checks the code,
rsyncs the files over SSH, (re)starts the app with PM2 and checks it responds.

**1. On CloudPanel:** *Add Site → Create a Node.js Site*, pick **Node.js 24** and an **App Port**
(e.g. `3087` — pick one no other app uses; check with `ss -tlnp`). Note the site user and the site root, e.g. `/home/spooky/htdocs/game.example.com`.
Enable Let's Encrypt for HTTPS.

**2. SSH key:** generate a key pair just for deploys and add the public key to the site user
(CloudPanel → Site → *Settings / SSH Keys*, or append it to `~/.ssh/authorized_keys` of the site user):

```bash
ssh-keygen -t ed25519 -C "github-deploy" -f spooky_deploy -N ""
ssh-keyscan -p 22 your.server.ip      # output -> SSH_KNOWN_HOSTS
```

**3. GitHub secrets** (repo → *Settings → Secrets and variables → Actions*):

| Secret | Example | Required |
| --- | --- | --- |
| `SSH_PRIVATE_KEY` | contents of `spooky_deploy` | yes |
| `SSH_HOST` | `203.0.113.10` | yes |
| `SSH_USER` | `spooky` (the CloudPanel site user) | yes |
| `DEPLOY_PATH` | `/home/spooky/htdocs/game.example.com` | yes |
| `APP_PORT` | `3087` — must match the App Port set in CloudPanel | default `3087` |
| `SSH_PORT` | `22` | default `22` |
| `SSH_KNOWN_HOSTS` | output of `ssh-keyscan` | recommended (otherwise the host key is trusted on first use) |

**4. Server-only settings** (optional): create `DEPLOY_PATH/.env` on the server, e.g.
`ADMIN_KEY=some-long-random-string`. Deploys never overwrite `.env` or the `data/` folder
holding the leaderboard.

## Leaderboard API

| Method | Path | Description |
| --- | --- | --- |
| `POST` | `/api/session` | Starts a game session (called when a round starts) |
| `GET` | `/api/vendor` | The deployment's default vendor id |
| `GET` | `/api/leaderboard?vendor=<id>&period=daily\|weekly\|all&limit=10` | Ranked best entry per mobile number: `{ rank, name, tag, score, packs }` (no phone numbers) |
| `POST` | `/api/scores` | `{ session, vendor, name, phone, reason, packs, flavourCounts (i1…i5), packPoints, comboPoints, speedPoints, nearMisses, sets, survivedSec, livesLeft, score }` → `{ rank, best, improved }` |

### Picking winners

```
GET /api/admin/winners?vendor=spooky&period=daily&limit=5&format=csv&key=YOUR_ADMIN_KEY
```

Each vendor has its own leaderboard, so one server can host several demos without mixing
scores. `vendor` defaults to the deployment's `VENDOR`. Downloads the ranked top N (`period` = `daily`, `weekly` or `all`; `format` = `csv` or `json`)
with each winner's **full mobile number**, name, score and full breakdown — ready for the prize
team. Days and weeks follow `TZ_OFFSET_MIN` (Sri Lanka time by default), weeks start Monday.

### Anti-cheat

Each session can submit once. The server recomputes the total from the breakdown and
bounds-checks every part (packs = sum of the five kinds, sets = complete sets, combo/speed
points within their maximum, near misses within what five skeletons could give, the round
can't finish faster than real time, and a cap on how fast packs can be collected). A
determined cheater can still forge a browser game's requests — sanity-check the top entries
before awarding prizes.

Mobile numbers are never returned by the public leaderboard, only by the admin export. Make
sure the campaign's privacy notice covers collecting them.

## Re-skinning for a vendor

1. Copy `vendors/spooky` to `vendors/<new-id>` (lowercase letters, digits and `-`).
2. Edit `vendors/<new-id>/vendor.json`:

   ```jsonc
   {
     "title": ["ACME", "MAZE MADNESS"],            // two-line logo
     "logo": "logo.png",                           // optional image in the same folder, or null
     "tagline": ["COLLECT.", "SURVIVE.", "WIN."],
     "colors": { "primary": "#ff8a1f", "secondary": "#7dff3a" },
     "item": { "one": "chocolate bar", "many": "chocolate bars", "shape": "box" },  // bag | can | box | coin | gift
     "label": { "brand": "ACME", "tagline": "CHOCOLATE" },   // printed on the drawn items
     "items": [                                    // exactly five kinds
       { "name": "Milk", "color": "#7c4a2d", "accent": "#fde68a", "image": null }
       // … four more; "image": "milk.png" uses real product artwork instead of the drawn label
     ],
     "prizes": { "daily": "…", "weekly": "…", "final": "…" }
   }
   ```

3. **Pitch it:** open `https://<your-server>/?vendor=<new-id>` — every vendor folder on the
   server works as a live demo link with its own leaderboard.
4. **Sell it:** for the buyer's own deployment set `VENDOR=<new-id>` in the server `.env`.

If a vendor file has a mistake the browser console says exactly what (e.g. "items must list
exactly 5 collectibles") and the game falls back to the default skin.

## Tuning the game

Gameplay settings live in [`js/config.js`](js/config.js) and apply to every vendor:

- `RULES`, `SCORING` — round length, lives, points. The server imports this same file, so
  validation always matches.
- `MONSTERS` — speed and how aggressively each one chases the player.
- `MAZE` — maze size for portrait (phones) and landscape (desktop) layouts.

## Project layout

```
index.html, css/style.css   UI: HUD, menus, rules, leaderboard, game-over form
js/main.js                  UI flow and wiring (applies the vendor skin)
js/vendor.js                Loads and validates vendors/<id>/vendor.json
vendors/<id>/               One folder per vendor skin
js/game.js                  Game loop, rules, scoring, camera
js/maze.js                  Maze generation (braided so there are escape loops) + BFS
js/world.js                 Builds the dungeon from KayKit pieces, lights, portal, decor
js/entities.js              Player, skeleton monsters (animated), savoury packs
js/vfx.js                   Brackeys sprite-sheet effects and particles
js/audio.js                 Synthesised music + sound effects (Web Audio, no files)
js/input.js                 Keyboard / swipe / D-pad
js/leaderboard.js           Leaderboard client with offline fallback
server.js                   Static server + leaderboard API
assets/                     Models, textures, VFX (see credits)
vendor/three                three.js r170 (MIT)
```

## Credits

All third-party assets are CC0 — see [`assets/licenses`](assets/licenses).

- Dungeon & skeleton models: **KayKit Dungeon Pack** and **KayKit Skeletons** by Kay Lousberg (kaylousberg.com)
- Effects: **Brackeys VFX Bundle** (particles by Picster & Kenney, sprite sheets by CodeManu)
- Engine: [three.js](https://threejs.org) (MIT)
- Fonts: Creepster, Luckiest Guy, Nunito (Google Fonts, OFL)
