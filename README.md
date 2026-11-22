# Flip 7 Online

Online multiplayer version of the card game Flip 7. Create a private room, share the link, play in the browser on desktop or mobile.

- **Server:** Node.js + WebSockets (`ws`). All game state lives on the server (`engine.js` holds the rules, `server.js` the rooms and networking).
- **Client:** plain HTML/CSS/JS in `public/`, no build step.

## Run locally

```
npm install
npm start        # http://localhost:3000
npm test         # rules tests + a full game played over real WebSockets
```

## Deploy (free) on Render

1. Sign in at https://render.com with GitHub.
2. New → Web Service → pick this repo. Render reads `render.yaml`; otherwise set build `npm install`, start `npm start`, plan Free.
3. Open the `https://<name>.onrender.com` URL and share it.

The free plan sleeps after ~15 minutes without visitors; the first visit afterwards takes up to a minute to wake it, and rooms in progress are lost when it sleeps. Any host that runs a Node process with WebSockets works too (a `Dockerfile` is included).

## Rules implemented

94-card deck (0–12, with N copies of each N and one 0; +2 +4 +6 +8 +10; ×2; 3 each of Freeze, Flip Three, Second Chance). Bust on a duplicate number, Flip 7 ends the round with +15, score = numbers (×2) + modifiers + bonus, first to 200 at the end of a round wins, ties play on. Deck is not reshuffled between rounds; discards are reshuffled when it runs out.

Flip 7 is designed by Eric Olsen and published by The Op Games. This is an unofficial fan implementation with original artwork.
