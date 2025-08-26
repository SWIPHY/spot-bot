import { SlashCommandBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("loop")
  .setDescription("Mode boucle: off / track / queue")
  .addStringOption(o =>
    o.setName("mode")
     .setDescription("off | track | queue")
     .setRequired(true)
     .addChoices(
       { name: "off", value: "off" },
       { name: "track", value: "track" },
       { name: "queue", value: "queue" },
     )
  );

export async function execute(interaction, { states }) {
  const state = states.get(interaction.guild.id);
  if (!state) return interaction.reply("❌ Rien en cours.");
  const mode = interaction.options.getString("mode", true);
  state.queue.loop = mode;
  return interaction.reply(`🔁 Loop → **${mode}**`);
}
