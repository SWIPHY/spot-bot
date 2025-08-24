import SpotifyWebApi from 'spotify-web-api-node';

const tokensByUser = new Map(); // userId -> { access, refresh, expiresAt }

export function appClient() {
  return new SpotifyWebApi({
    clientId: process.env.SPOTIFY_CLIENT_ID,
    clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
    redirectUri: process.env.SPOTIFY_REDIRECT_URI,
  });
}

export function buildAuthUrl(state) {
  const scopes = [
    'user-read-email',
    'user-read-private',
    'user-read-playback-state',
    'user-read-currently-playing',
    'playlist-modify-public',
    'playlist-modify-private',
  ];
  return appClient().createAuthorizeURL(scopes, state, true);
}

export async function finishAuth(code, userId) {
  const api = appClient();
  const { body } = await api.authorizationCodeGrant(code);
  tokensByUser.set(userId, {
    access: body.access_token,
    refresh: body.refresh_token,
    expiresAt: Date.now() + body.expires_in * 1000,
  });
}

export async function userApi(userId) {
  const tk = tokensByUser.get(userId);
  if (!tk) throw new Error('NO_SPOTIFY');
  const api = appClient();
  if (Date.now() > (tk.expiresAt - 10_000)) {
    api.setRefreshToken(tk.refresh);
    const { body } = await api.refreshAccessToken();
    tk.access = body.access_token;
    tk.expiresAt = Date.now() + body.expires_in * 1000;
    tokensByUser.set(userId, tk);
  }
  api.setAccessToken(tk.access);
  return api;
}
