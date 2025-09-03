import { SlashCommandBuilder, EmbedBuilder } from "discord.js";

/**
 * /queue — Affiche la file d'attente
 * On s'attend à ce que `states` soit une Map<guildId, { queue: Queue }>
 * où Queue possède: items[], index (int), current (getter)
 */
export const data = new SlashCommandBuilder()
  .setName("queue")
  .setDescription("Affiche la file d'attente du serveur");

export async function execute(interaction, { states }) {
  const state = states.get(interaction.guildId);
  if (!state || !state.queue || state.queue.items.length === 0) {
    return interaction.reply({ content: "📭 File vide.", ephemeral: true });
  }

  const q = state.queue; // ta classe Queue (items + index + current)
  
  // On formate les 15 premières entrées
  const lines = q.items
    .map((t, i) => {
      const isCurrent = i === q.index;
      const pos = String(i + 1).padStart(2, "0");
      const who = t.requestedBy ? ` — _${t.requestedBy}_` : "";
      const title = t.title ?? "Unknown";
      return `${isCurrent ? "🔊" : "　"} **${pos}.** ${title}${who}`;
    })
    .slice(0, 15);

  // Si plus d’éléments, on l’indique
  const more =
    q.items.length > 15
      ? `\n… et ${q.items.length - 15} autre(s) élément(s) dans la file.`
      : "";

  const now = q.current
    ? `**En cours :** ${q.current.title ?? "Unknown"}`
    : "Aucun morceau en cours.";

  const embed = new EmbedBuilder()
    .setColor(0x00b894)
    .setTitle("🎶 File d’attente")
    .setDescription([now, "", lines.join("\n"), more].join("\n"))
    .setFooter({
      text: `Total: ${q.items.length} • Index: ${q.index < 0 ? "—" : q.index + 1}`,
    });

  return interaction.reply({ embeds: [embed] });
}
