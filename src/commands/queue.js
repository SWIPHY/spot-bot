export const data = { name: 'queue', description: 'Affiche la file' };
export async function execute(interaction, ctx) {
const state = ctx.states.get(interaction.guildId);
if (!state) return interaction.reply('Queue vide.');
const now = state.queue.current ? `🎶 Now: ${state.queue.current.title}` : 'Rien en cours';
const list = state.queue.tracks
.slice(0, 10)
.map((t, i) => `${i + 1}. ${t.title}`)
.join('\n');
return interaction.reply(`${now}\n\n**À venir:**\n${list || '—'}`);
}