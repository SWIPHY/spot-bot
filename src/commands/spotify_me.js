import { userApi } from '../util/spotify.js';

export const data = { name: 'spotify_me', description: 'Voir mon profil Spotify' };
export async function execute(interaction) {
  try {
    const api = await userApi(interaction.user.id);
    const me = (await api.getMe()).body;
    return interaction.reply(`**${me.display_name}** — Followers: ${me.followers.total}\n${me.external_urls.spotify}`);
  } catch {
    return interaction.reply({ content: '🔗 Fais /spotify_link d’abord.', ephemeral: true });
  }
}
