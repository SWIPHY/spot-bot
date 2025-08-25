import SpotifyWebApi from "spotify-web-api-node";
import { getUserTokens, saveUserTokens } from "./tokenStore.js";

export function createClientFor(userId) {
  const tokens = getUserTokens(userId);
  if (!tokens) throw new Error("no_tokens");

  const api = new SpotifyWebApi({
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
    redirectUri: process.env.SPOTIFY_REDIRECT_URL, // tu as choisi cette var
  });

  api.setAccessToken(tokens.access_token);
  if (tokens.refresh_token) api.setRefreshToken(tokens.refresh_token);

  // wrapper d’appel qui refresh si 401/expired
  async function call(fn, ...args) {
    try {
      return await api[fn](...args);
    } catch (e) {
      const status = e?.statusCode || e?.body?.error?.status;
      if (status === 401) {
        const data = await api.refreshAccessToken();
        api.setAccessToken(data.body.access_token);
        saveUserTokens(userId, {
          access_token: data.body.access_token,
          expires_in: data.body.expires_in,
          // pas de refresh_token dans le refresh, on garde l’existant
        });
        return await api[fn](...args); // retry
      }
      throw e;
    }
  }

  return { api, call };
}
