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

## Build the downloadable package (source repository only)

```bash
npm run package       # -> dist/spooky-maze-runner-v1.0.0.zip
```

## Credits

KayKit Dungeon Pack & Skeletons by Kay Lousberg (CC0) · Brackeys VFX bundle (CC0) ·
three.js (MIT) · Creepster & Nunito (SIL OFL) · Luckiest Guy (Apache 2.0).
Licences are in `assets/licenses/` and `vendor/three/LICENSE`.
