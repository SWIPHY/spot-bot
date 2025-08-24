import { userApi } from '../util/spotify.js';

export const data = { name: 'spotify_now', description: 'Ce que j’écoute (temps réel)' };
export async function execute(interaction) {
  try {
    const api = await userApi(interaction.user.id);
    const cur = (await api.getMyCurrentPlaybackState()).body;
    if (!cur?.item) return interaction.reply('Rien en lecture.');
    const t = cur.item;
    return interaction.reply(`🎧 **${t.name}** — ${t.artists.map(a=>a.name).join(', ')}\n${t.external_urls?.spotify || ''}`);
  } catch {
    return interaction.reply({ content: '🔗 Fais /spotify_link d’abord.', ephemeral: true });
  }
}
