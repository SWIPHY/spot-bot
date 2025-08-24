import { userApi } from '../util/spotify.js';

export const data = { name: 'spotify_add', description: 'Ajoute le son courant à la playlist commune' };
export async function execute(interaction) {
  try {
    const api = await userApi(interaction.user.id);
    const cur = (await api.getMyCurrentPlayingTrack()).body;
    if (!cur?.item?.uri) return interaction.reply('Pas de piste en cours.');
    const playlistId = process.env.SPOTIFY_SHARED_PLAYLIST_ID;
    if (!playlistId) return interaction.reply('Configure SPOTIFY_SHARED_PLAYLIST_ID dans .env');
    await api.addTracksToPlaylist(playlistId, [cur.item.uri]);
    return interaction.reply('✅ Ajouté à la playlist commune.');
  } catch {
    return interaction.reply({ content: '🔗 Lie Spotify: /spotify_link', ephemeral: true });
  }
}
