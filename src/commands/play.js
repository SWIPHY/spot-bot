import {
  SlashCommandBuilder,
  PermissionFlagsBits,
} from "discord.js";
import { MusicQueue } from "../core/queue.js";
import { GuildPlayer } from "../core/player.js";
import { resolveTrack } from "../util/resolveTrack.js";
import { logToDiscord } from "../util/logger.js";

// Fallback local si l'app ne fournit pas ctx.states
const _localStates = new Map();
function ensureState(guild, textChannel, statesFromCtx, createFromCtx) {
  if (statesFromCtx && createFromCtx) {
    let s = statesFromCtx.get(guild.id);
    if (!s || !s.player) {
      const queue = new MusicQueue(guild.id);
      const player = new GuildPlayer(guild, queue, textChannel);
      s = { queue, player };
      statesFromCtx.set(guild.id, s);
    }
    return s;
  }
  // fallback local
  let s = _localStates.get(guild.id);
  if (!s || !s.player) {
    const queue = new MusicQueue(guild.id);
    const player = new GuildPlayer(guild, queue, textChannel);
    s = { queue, player };
    _localStates.set(guild.id, s);
  }
  return s;
}

export const data = new SlashCommandBuilder()
  .setName("play")
  .setDescription("Joue un son depuis YouTube (URL ou mots-clés)")
  .addStringOption((o) =>
    o
      .setName("query")
      .setDescription("URL YouTube ou recherche")
      .setRequired(true)
  )
  .setDefaultMemberPermissions(PermissionFlagsBits.SendMessages);

export async function execute(interaction, ctx) {
  try {
    const member = await interaction.guild.members.fetch(
      interaction.user.id
    );
    const voice = member.voice?.channel;
    if (!voice) {
      return interaction.reply({
        content: "❌ Tu dois être en vocal.",
        ephemeral: true,
      });
    }

    const query = interaction.options.getString("query", true).trim();
    await interaction.deferReply(); // on montre pas d’erreur interne au moindre délai

    // Résolution du titre/URL
    let track;
    try {
      track = await resolveTrack(query);
    } catch (e) {
      logToDiscord(
        `❌ Erreur interaction: While getting info from url\n${e?.message || e}`
      );
      return interaction.editReply(
        "❌ Oups, erreur pendant la résolution du titre (check logs)."
      );
    }

    if (!track) {
      return interaction.editReply("❌ Rien trouvé pour ta recherche.");
    }

    // State + player garantis
    const state = ensureState(
      interaction.guild,
      interaction.channel,
      ctx?.states,
      ctx?.createGuildState
    );

    const res = await state.player.addAndPlay(track, voice);
    const prefix = res === "queued" ? "➕ Ajouté à la file :" : "▶️ Je joue :";
    await interaction.editReply(
      `${prefix} **${track.title}**\n${track.url}`
    );
    logToDiscord(
      `🎧 /play -> ${track.title} (${track.url}) (demandé par ${interaction.user.username})`
    );
  } catch (e) {
    logToDiscord(`❌ Erreur /play: ${e?.message || e}`);
    console.error(e);
    if (interaction.deferred || interaction.replied) {
      return interaction.editReply("❌ Oups, erreur interne.");
    }
    return interaction.reply({
      content: "❌ Oups, erreur interne.",
      ephemeral: true,
    });
  }
}
