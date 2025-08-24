import { guardDJ } from '../util/permissions.js';

export const data = { 
  name: 'skip', 
  description: 'Passe au prochain' 
};

export async function execute(interaction, ctx) {
  try { 
    guardDJ(interaction); 
  } 
  catch { 
    return interaction.reply({ content: '🔒 Réservé au rôle DJ.', ephemeral: true }); 
  }
  const state = ctx.states.get(interaction.guildId);
  if (!state) return interaction.reply('Rien à jouer.');
  state.player.next();
  return interaction.reply('⏭️ Skip.');
}
