import express from 'express';
import SpotifyWebApi from 'spotify-web-api-node';
import { saveUserTokens } from "./util/tokenStore.js";

export function startSpotifyServer() {
const app = express();
const PORT = Number(process.env.PORT) || 8080; // force 8080 par défaut
console.log('PORT used =', PORT);


const spotify = new SpotifyWebApi({
clientId: process.env.SPOTIFY_CLIENT_ID,
clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
redirectUri: process.env.SPOTIFY_REDIRECT_URL,
});


const stateByUser = new Map();


app.get('/', (_req, res) => res.send('✅ HTTP OK (Spotify server actif)'));


app.get('/link', (req, res) => {
const user = req.query.user;
if (!user) return res.status(400).send('❌ missing user');


const scopes = [
  "user-read-playback-state",
  "user-modify-playback-state",
  "user-read-currently-playing",
  "playlist-modify-public",
  "playlist-modify-private",
];

const state = `u_${user}_${Date.now()}`;
stateByUser.set(state, user);


const url = spotify.createAuthorizeURL(scopes, state);
res.redirect(url);
});


app.get("/callback", async (req, res) => {
  const { code, state } = req.query;
  if (!code) return res.status(400).send("❌ missing code");
  try {
    const data = await spotify.authorizationCodeGrant(code);
    const userId = stateByUser.get(state);

    // persist
    saveUserTokens(userId, {
      access_token: data.body.access_token,
      refresh_token: data.body.refresh_token,   // parfois null si déjà donné
      expires_in: data.body.expires_in,
      scope: data.body.scope,
    });

    console.log("🎉 Tokens sauvegardés pour user:", userId);
    res.send("🎶 Spotify connecté ! Retourne sur Discord.");
  } catch (err) {
    console.error("Erreur callback Spotify:", err?.body || err);
    res.status(500).send("❌ Erreur pendant l’authentification Spotify.");
  }
});


app.listen(PORT, '0.0.0.0', () => console.log(`🌍 Spotify server on :${PORT}`));
}