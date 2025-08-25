import express from 'express';
import SpotifyWebApi from 'spotify-web-api-node';


export function startSpotifyServer() {
const app = express();
const PORT = process.env.PORT || 3000;


const spotify = new SpotifyWebApi({
clientId: process.env.SPOTIFY_CLIENT_ID,
clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
redirectUri: `${process.env.PUBLIC_URL}/callback`,
});


const stateByUser = new Map();


app.get('/', (_req, res) => res.send('✅ HTTP OK (Spotify server actif)'));


app.get('/link', (req, res) => {
const user = req.query.user;
if (!user) return res.status(400).send('❌ missing user');


const scopes = [
'user-read-playback-state',
'user-modify-playback-state',
'user-read-currently-playing',
];
const state = `u_${user}_${Date.now()}`;
stateByUser.set(state, user);


const url = spotify.createAuthorizeURL(scopes, state);
res.redirect(url);
});


app.get('/callback', async (req, res) => {
const { code, state } = req.query;
if (!code) return res.status(400).send('❌ missing code');


try {
const data = await spotify.authorizationCodeGrant(code);
spotify.setAccessToken(data.body.access_token);
spotify.setRefreshToken(data.body.refresh_token);
console.log('🎉 Tokens reçus pour user:', stateByUser.get(state));
res.send('🎶 Spotify connecté ! Retourne sur Discord.');
} catch (err) {
console.error('Erreur callback Spotify:', err?.body || err);
res.status(500).send('❌ Erreur pendant l\'authentification Spotify.');
}
});


app.listen(PORT, () => console.log(`🌍 Spotify server on :${PORT}`));
}