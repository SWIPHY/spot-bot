// src/commands/play.js
import { SlashCommandBuilder } from "discord.js";
import play from "play-dl";
import { logToDiscord } from "../util/logger.js";

export const data = new SlashCommandBuilder()
  .setName("play")
  .setDescription("Joue une musique (URL YouTube ou recherche texte)")
  .addStringOption(o =>
    o.setName("query")
      .setDescription("URL YouTube (watch/shorts/youtu.be/playlist) ou mots-clés")
      .setRequired(true)
  );

function cleanYoutubeUrl(raw) {
  let url = raw.trim();

  // Discord colle parfois des chevrons <url>
  if (url.startsWith("<") && url.endsWith(">")) url = url.slice(1, -1);

  try {
    const u = new URL(url);

    // youtu.be/XXXX -> www.youtube.com/watch?v=XXXX
    if (u.hostname === "youtu.be") {
      const v = u.pathname.replace("/", "");
      return `https://www.youtube.com/watch?v=${v}`;
    }

    // shorts -> watch
    if (u.hostname.includes("youtube.com") && u.pathname.startsWith("/shorts/")) {
      const v = u.pathname.split("/")[2];
      return `https://www.youtube.com/watch?v=${v}`;
    }

    // garde uniquement les params utiles (v, t) pour watch
    if (u.hostname.includes("youtube.com") && u.pathname === "/watch") {
      const v = u.searchParams.get("v");
      const t = u.searchParams.get("t");
      if (v) {
        const base = new URL("https://www.youtube.com/watch");
        base.searchParams.set("v", v);
        if (t) base.searchParams.set("t", t);
        return base.toString();
      }
    }
    return url;
  } catch {
    return raw; // pas une URL → on laissera la recherche gérer
  }
}

export async function execute(interaction, ctx) {
  const queryRaw = interaction.options.getString("query", true);
  const vc = interaction.member?.voice?.channel;
  if (!vc) {
    return interaction.reply({ content: "❌ Rejoins un salon vocal d’abord.", ephemeral: true });
  }

  await interaction.deferReply();

  // récupère/crée l’état
  let state = ctx.states.get(interaction.guildId);
  if (!state) {
    state = ctx.createGuildState(interaction.guild, interaction.channel);
    ctx.states.set(interaction.guildId, state);
  }

  try {
    const cleaned = cleanYoutubeUrl(queryRaw);
    const isUrl = /^https?:\/\//i.test(cleaned);

    let url = null;
    let title = null;

    if (isUrl) {
      // Normalise & valide avec play-dl
      const kind = play.yt_validate(cleaned); // 'video' | 'playlist' | ...
      if (kind === "video") {
        const info = await play.video_info(cleaned);
        url = info.video_details.url;
        title = info.video_details.title;
      } else if (kind === "playlist") {
        // on prend la 1ère vidéo de la playlist
        const pl = await play.playlist_info(cleaned, { incomplete: true });
        const vids = await pl?.videos();
        if (!vids?.length) throw new Error("Playlist vide.");
        url = vids[0].url;
        title = vids[0].title;
      } else {
        // pas reconnu par yt_validate → on tente recherche avec le texte brut
        const results = await play.search(queryRaw, { limit: 1, source: { youtube: "video" } });
        if (!results.length) return interaction.editReply("❌ Rien trouvé pour cette URL.");
        url = results[0].url;
        title = results[0].title;
      }
    } else {
      // recherche texte
      const results = await play.search(queryRaw, { limit: 1, source: { youtube: "video" } });
      if (!results.length) return interaction.editReply("❌ Rien trouvé pour ta recherche.");
      url = results[0].url;
      title = results[0].title;
    }

    // track minimal
    const track = { title, url };

    // s’assure que le player existe (au cas où)
    if (!state.player?.addAndPlay) {
      throw new Error("Player non initialisé (addAndPlay manquant).");
    }

    const res = await state.player.addAndPlay(track, vc);
    if (res === "started") {
      await interaction.editReply(`▶️ **Je joue :** ${title}\n${url}`);
    } else {
      await interaction.editReply(`➕ **Ajouté à la file :** ${title}`);
    }
    logToDiscord(`🎧 /play -> ${title} (${url})`);
  } catch (e) {
    console.error("play command error:", e);
    logToDiscord(`❌ Erreur interaction: ${e?.message || e}`);
    try {
      await interaction.editReply("❌ Oups, erreur interne.");
    } catch {}
  }
}
