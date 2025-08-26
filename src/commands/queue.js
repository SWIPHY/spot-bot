import { SlashCommandBuilder, EmbedBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("queue")
  .setDescription("Affiche la file d'attente");

export async function execute(interaction, { states }) {
  const state = states.get(interaction.guild.id);
  if (!state || state.queue.items.length === 0) {
    return interaction.reply("📭 File vide.");
  }
  const { queue } = state;

  const desc = queue.items
    .map((t, i) => `${i === queue.index ? "▶️" : `${i + 1}.`} ${t.title} • _${t.requestedBy}_`)
    .slice(0, 15)
    .join("\n");

  const embed = new EmbedBuilder()
    .setColor(0x1DB954)
    .setTitle("📜 File d'attente")
    .setDescription(desc)
    .setFooter({ text: `Loop: ${queue.loop.toUpperCase()} • Total: ${queue.items.length}` });

  return interaction.reply({ embeds: [embed] });
}
