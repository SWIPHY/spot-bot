// server.js (ESM)
import express from "express";
import SpotifyWebApi from "spotify-web-api-node";
const app = express();

const spotify = new SpotifyWebApi({
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
  redirectUri: process.env.SPOTIFY_REDIRECT_URI, // va pointer sur le loca.lt
});

app.get("/callback", async (req, res) => {
  const code = req.query.code;
  console.log("Callback hit. code=", code);
  try {
    const data = await spotify.authorizationCodeGrant(code);
    console.log("Tokens:", data.body);
    spotify.setAccessToken(data.body.access_token);
    spotify.setRefreshToken(data.body.refresh_token);
    res.send("🎶 Spotify connecté !");
  } catch (err) {
    console.error("Erreur callback Spotify:", err);
    res.status(500).send("❌ Erreur auth Spotify");
  }
});

app.get("/", (req, res) => {
  res.send("✅ HTTP OK, serveur en vie !");
});

app.listen(3000, () => console.log("HTTP up on :3000"));
