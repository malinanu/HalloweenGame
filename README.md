# 👻 Spooky Maze Runner

A re-skinnable Halloween HTML5 maze game with leaderboards, built with three.js.

Players run through a haunted 3D dungeon maze collecting the sponsor's products while five
skeleton monsters hunt them down. 60-second rounds, three lives, a new maze every round,
daily/weekly/all-time leaderboards and a winners CSV export make it ready for brand promotions.

**Full documentation:** open [`documentation/index.html`](documentation/index.html).

## Quick start

```bash
node server.js        # Node.js 18+, no npm install needed
# open http://localhost:8080
```

Or upload the folder to any static web host (the leaderboard then stays on each player's device).

## Re-skin

Copy `vendors/spooky` to `vendors/<your-id>`, edit `vendor.json` (name, logo, colours,
five collectibles and their shape, prizes), then open `/?vendor=<your-id>` or start the server
with `VENDOR=<your-id>`. Included skins: `spooky`, `example-drinks`, `example-rewards`.

## Builds for YouTube Playables and game portals

```bash
node tools/package.js --target youtube                       # YouTube Playables upload
node tools/package.js --target crazygames                    # CrazyGames upload
node tools/package.js --target gamedistribution --gd-id ID   # GameDistribution upload
node tools/package.js                                        # full web package
```

Each writes a zip to `dist/`. See the documentation for what each build changes.

## Credits

KayKit Dungeon Pack & Skeletons by Kay Lousberg (CC0) · Brackeys VFX bundle (CC0) ·
three.js (MIT) · Creepster & Nunito (SIL OFL) · Luckiest Guy (Apache 2.0).
Licences are in `assets/licenses/` and `vendor/three/LICENSE`.
