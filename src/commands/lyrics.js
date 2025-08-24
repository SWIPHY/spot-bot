export const data = { name: 'lyrics', description: 'Paroles (MVP)', options: [{ name:'query', type:3, required:true, description:'titre ou artiste' }] };

export async function execute(interaction) {
  const q = interaction.options.getString('query', true);
  try {
    const res = await fetch(`https://lrclib.net/api/get?track_name=${encodeURIComponent(q)}`);
    if (!res.ok) return interaction.reply('Paroles introuvables.');
    const body = await res.json();
    const text = body?.plainLyrics?.slice(0, 1900) || '—';
    return interaction.reply(`📜 **Lyrics**\n${text}`);
  } catch {
    return interaction.reply('Erreur lyrics.');
  }
}
