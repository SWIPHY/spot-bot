import { guardDJ } from '../util/permissions.js';

export const data = { 
  name: 'stop', 
  description: 'Stop & clear' 
};

export async function execute(interaction, ctx) {
  try { 
    guardDJ(interaction); 
  } 
  catch { 
    return interaction.reply({ content: '🔒 Réservé au rôle DJ.', ephemeral: true }); 
  }
  const state = ctx.states.get(interaction.guildId);
  if (!state) return interaction.reply('Déjà stoppé.');
  state.player.stop();
  return interaction.reply('🛑 Stop + queue vidée.');
}
