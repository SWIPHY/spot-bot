import { guardDJ } from '../util/permissions.js';

export const data = { 
  name: 'resume', 
  description: 'Reprise' 
};

export async function execute(interaction, ctx) {
  try { 
    guardDJ(interaction); 
  } 
  catch { 
    return interaction.reply({ content: '🔒 Réservé au rôle DJ.', ephemeral: true }); 
  }
  const state = ctx.states.get(interaction.guildId);
  if (!state) return interaction.reply('Aucun player.');
  state.player.unpause();
  return interaction.reply('▶️ Reprise.');
}
