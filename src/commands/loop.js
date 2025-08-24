import { guardDJ } from '../util/permissions.js';

export const data = { 
  name: 'loop', 
  description: 'Boucle la lecture', 
  options: [{ name: 'mode', type: 3, description: 'off|track|queue', required: true }],
};

export async function execute(interaction, ctx) {
  try { 
    guardDJ(interaction); 
  } 
  catch { 
    return interaction.reply({ content: '🔒 Réservé au rôle DJ.', ephemeral: true }); 
  }
  const mode = interaction.options.getString('mode', true);
  const state = ctx.states.get(interaction.guildId);
  if (!state) return interaction.reply('Rien à boucler.');
  if (!['off', 'track', 'queue'].includes(mode)) return interaction.reply('Mode invalide.');
  state.queue.loopMode = mode;
  return interaction.reply(`🔁 Loop: **${mode}**`);
}
