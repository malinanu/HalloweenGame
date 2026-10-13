# 🎃 Maliban Savoury Maze

A Halloween maze-runner web game for the Maliban Savoury campaign. Players enter a haunted
dungeon maze, collect Maliban savoury packs, dodge five skeleton monsters and submit their
score to a daily / weekly / all-time leaderboard to compete for Maliban gifts.

Runs in any modern browser on phones, tablets and desktops (Three.js / WebGL, no build step).

## How to play

1. Enter the maze (through the green portal).
2. Collect as many Maliban savoury packs as possible.
3. Avoid the five characters (Warrior, Rogue, Mage, Minion and the Ghost).
4. Survive until time runs out.
5. Submit your score to the leaderboard.
6. Compete to win Maliban gifts.

**Controls:** arrow keys / WASD on desktop · swipe or on-screen D-pad on mobile · `P` / `Esc` to pause.

### Rules & scoring (from the campaign brief)

| Rule | Value |
| --- | --- |
| Round length | 60 seconds |
| Lives | 3 (touching a monster removes one, then 2 s of invulnerability) |
| Each pack collected | 10 points |
| Collect all five products | +50 bonus (once per round) |
| Each life left when time runs out | +20 bonus |
| Game ends | when time runs out or all lives are lost |

Packs keep re-appearing around the maze, balanced across the five flavours. Players can play
again as often as they like — the leaderboard keeps each player's **best** score.

## Running it

Requires Node.js 18+ (no `npm install` needed — zero dependencies).

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
| `ADMIN_KEY` | *(unset)* | Enables `GET /api/admin/winners?period=daily\|weekly\|all&key=…` which returns the top 50 **including mobile numbers** for contacting winners |

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

**1. On CloudPanel:** *Add Site → Create a Node.js Site*, pick a Node version and an **App Port**
(e.g. `3087` — pick one no other app uses; check with `ss -tlnp`). Note the site user and the site root, e.g. `/home/maliban/htdocs/game.example.com`.
Enable Let's Encrypt for HTTPS.

**2. SSH key:** generate a key pair just for deploys and add the public key to the site user
(CloudPanel → Site → *Settings / SSH Keys*, or append it to `~/.ssh/authorized_keys` of the site user):

```bash
ssh-keygen -t ed25519 -C "github-deploy" -f maliban_deploy -N ""
ssh-keyscan -p 22 your.server.ip      # output -> SSH_KNOWN_HOSTS
```

**3. GitHub secrets** (repo → *Settings → Secrets and variables → Actions*):

| Secret | Example | Required |
| --- | --- | --- |
| `SSH_PRIVATE_KEY` | contents of `maliban_deploy` | yes |
| `SSH_HOST` | `203.0.113.10` | yes |
| `SSH_USER` | `maliban` (the CloudPanel site user) | yes |
| `DEPLOY_PATH` | `/home/maliban/htdocs/game.example.com` | yes |
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
| `GET` | `/api/leaderboard?period=daily\|weekly\|all&limit=10` | Best score per player for the period |
| `POST` | `/api/scores` | `{ session, name, phone?, score, packs, livesLeft, flavours, reason }` |

Basic anti-cheat: each session can submit once, the server recomputes the score from its
parts, checks the round actually lasted 60 s when time ran out, and caps how many packs could
physically have been collected. A determined cheater can still forge a browser game's
requests — before awarding prizes, sanity-check the top entries (e.g. via the admin endpoint).

Mobile numbers are optional, never returned by the public leaderboard and only exposed by the
admin endpoint. Make sure the campaign's privacy notice covers collecting them.

## Customising

Everything tunable lives in [`js/config.js`](js/config.js):

- `PRODUCTS` — the five Maliban savoury products (name + colours). The pack labels are drawn
  in code; to use real pack artwork, add images (e.g. `assets/packs/red.png`, portrait ~5:7)
  and list them in `PACK_ART`.
- `RULES`, `SCORING` — round length, lives, points. If you change scoring, update the matching
  `RULES` constant at the top of `server.js` so validation agrees.
- `MONSTERS` — speed and how aggressively each one chases the player.
- `MAZE` — maze size for portrait (phones) and landscape (desktop) layouts.

## Project layout

```
index.html, css/style.css   UI: HUD, menus, rules, leaderboard, game-over form
js/main.js                  UI flow and wiring
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
