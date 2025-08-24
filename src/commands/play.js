import { SlashCommandBuilder } from 'discord.js';
import { ytSuggest } from '../util/search.js';


export const data = new SlashCommandBuilder()
.setName('play')
.setDescription('Cherche et joue un son')
.addStringOption((opt) =>
opt.setName('query').setDescription('Titre ou URL').setRequired(true).setAutocomplete(true)
);


export async function autocomplete(interaction) {
const focused = interaction.options.getFocused();
const suggestions = await ytSuggest(focused);
await interaction.respond(
suggestions.map((s) => ({ name: `${s.title} • ${s.duration}`, value: s.url }))
);
}


export async function execute(interaction, ctx) {
const query = interaction.options.getString('query', true);
const member = await interaction.guild.members.fetch(interaction.user.id);
const vc = member.voice.channel;
if (!vc) return interaction.reply({ content: '⚠️ Rejoins un salon vocal.', ephemeral: true });


await interaction.deferReply();


let url = query;
// Si c'est un texte (pas URL), prends la 1ère suggestion
if (!/^https?:\/\//.test(query)) {
const [first] = await ytSuggest(query);
if (!first) return interaction.editReply('Aucun résultat.');
url = first.url;
}


// Récupère/instancie queue & player
let state = ctx.states.get(interaction.guildId);
if (!state) {
state = ctx.createGuildState(interaction.guild, interaction.channel);
}
const track = { title: query, url, requestedBy: interaction.user.tag };
state.queue.enqueue(track);


if (!state.queue.current) {
await state.player.connect(vc);
await state.player.next();
}


return interaction.editReply(`➕ Ajouté à la queue: ${track.url}`);
}