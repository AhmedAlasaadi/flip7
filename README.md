# Flip 7 Online

Online multiplayer version of the card game Flip 7. Create a private room, share the link, play in the browser on desktop or mobile.

- **Rules:** `engine.js`. **Rooms, lobby, turns, reconnects:** `room.js`. Both are shared by two interchangeable servers:
  - `worker/index.js` — Cloudflare Workers + Durable Objects (one object per room; rooms are saved, so they survive restarts).
  - `server.js` — plain Node.js + WebSockets (`ws`), for Render, a laptop or any Node host.
- **Client:** plain HTML/CSS/JS in `public/`, no build step.

## Awards ceremony

When a game ends, the server picks six awards from statistics it tracked during play (`computeAwards` in `engine.js`) and runs the ceremony on one shared timeline (`room.js`), so every player sees the same award at the same moment and late joiners drop in mid-scene. The six scenes are time-driven canvas animations in `public/awards.js`.

## Run locally

```
npm install
npm start        # http://localhost:3000
npm test         # rules tests + a full game played over real WebSockets
```

## Deploy (free) on Cloudflare

Either connect the repo in the Cloudflare dashboard (Workers & Pages → Create → import this repository; deploy command `npx wrangler deploy`), or from a terminal in this folder:

```
npx wrangler deploy
```

`wrangler.jsonc` holds the whole configuration. Test locally with `npx wrangler dev`.

## Deploy (free) on Render

1. Sign in at https://render.com with GitHub.
2. New → Web Service → pick this repo. Render reads `render.yaml`; otherwise set build `npm install`, start `npm start`, plan Free.
3. Open the `https://<name>.onrender.com` URL and share it.

The free plan sleeps after ~15 minutes without visitors; the first visit afterwards takes up to a minute to wake it, and rooms in progress are lost when it sleeps. Any host that runs a Node process with WebSockets works too (a `Dockerfile` is included).

## Rules implemented

94-card deck (0–12, with N copies of each N and one 0; +2 +4 +6 +8 +10; ×2; 3 each of Freeze, Flip Three, Second Chance). Bust on a duplicate number, Flip 7 ends the round with +15, score = numbers (×2) + modifiers + bonus, first to 200 at the end of a round wins, ties play on. Deck is not reshuffled between rounds; discards are reshuffled when it runs out.

Flip 7 is designed by Eric Olsen and published by The Op Games. This is an unofficial fan implementation with original artwork.
