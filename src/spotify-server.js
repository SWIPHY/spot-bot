import 'dotenv/config';
import express from 'express';
import { randomUUID } from 'crypto';
import { buildAuthUrl, finishAuth } from './util/spotify.js';

const app = express();
const states = new Map(); // state -> discordUserId

app.get('/link', (req, res) => {
  const user = String(req.query.user || '');
  if (!user) return res.status(400).send('Missing user id');
  const st = randomUUID();
  states.set(st, user);
  res.redirect(buildAuthUrl(st));
});

app.get('/callback', async (req, res) => {
  const { code, state } = req.query;
  const userId = states.get(state);
  if (!userId) return res.status(400).send('Invalid state');
  await finishAuth(code, userId);
  res.send('✅ Spotify lié ! Tu peux fermer cette page.');
});

export function startSpotifyServer() {
  const port = 3000;
  app.listen(port, () => console.log(`🎧 Spotify OAuth on http://localhost:${port}`));
}
