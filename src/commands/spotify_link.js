export const data = { name: 'spotify_link', description: 'Lier ton compte Spotify' };
export async function execute(interaction) {
  const url = `http://localhost:3000/link?user=${interaction.user.id}`;
  return interaction.reply({ content: `🔗 Autorise ici : ${url}`, ephemeral: true });
}
