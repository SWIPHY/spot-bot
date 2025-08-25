import { SlashCommandBuilder, EmbedBuilder } from "discord.js";
import { createClientFor } from "../util/spotifyClient.js";
import { hasUser } from "../util/tokenStore.js";

export const data = new SlashCommandBuilder()
  .setName("blindtest")
  .setDescription("Blind test depuis une playlist")
  .addSubcommand(sc =>
    sc.setName("start")
      .setDescription("Démarrer un blind test")
      .addStringOption(o => o.setName("playlist").setDescription("ID ou URL de playlist (sinon ENV)").setRequired(false))
      .addIntegerOption(o => o.setName("rounds").setDescription("Nombre de manches").setMinValue(1).setMaxValue(20))
  )
  .addSubcommand(sc =>
    sc.setName("guess")
      .setDescription("Proposer une réponse")
      .addStringOption(o => o.setName("reponse").setDescription("Titre ou artiste").setRequired(true))
  )
  .addSubcommand(sc =>
    sc.setName("stop").setDescription("Arrêter le blind test")
  );

const games = new Map(); // key: channelId -> { playlistId, queue:[tracks], current, scores:Map, ownerId }

function pickTracks(list, n) {
  const withPreview = list.filter(t => t.track?.preview_url);
  for (let i = withPreview.length - 1; i > 0; i--) { const j = Math.floor(Math.random()* (i+1)); [withPreview[i], withPreview[j]] = [withPreview[j], withPreview[i]]; }
  return withPreview.slice(0, n).map(t => t.track);
}

function playlistIdFrom(input) {
  if (!input) return process.env.SPOTIFY_SHARED_PLAYLIST_ID || null;
  const m = input.match(/playlist\/([a-zA-Z0-9]+)/);
  return m ? m[1] : input;
}

export async function execute(interaction) {
  const sub = interaction.options.getSubcommand();
  if (sub === "start") return start(interaction);
  if (sub === "guess") return guess(interaction);
  if (sub === "stop")  return stop(interaction);
}

async function start(interaction) {
  const channelId = interaction.channelId;
  if (games.has(channelId)) return interaction.reply("⚠️ Un blind test est déjà en cours ici.");

  const uid = interaction.user.id;
  if (!hasUser(uid)) return interaction.reply("❌ Pas de Spotify lié. Fais `/spotify_link`.");
  const plId = playlistIdFrom(interaction.options.getString("playlist"));
  if (!plId) return interaction.reply("❌ Donne une playlist ou configure `SPOTIFY_SHARED_PLAYLIST_ID`.");

  try {
    const { call } = createClientFor(uid);
    const info = await call("getPlaylistTracks", plId, { limit: 100 });
    const rounds = interaction.options.getInteger("rounds") ?? 5;
    const queue = pickTracks(info.body.items || [], rounds);

    if (queue.length === 0) return interaction.reply("❌ Aucun titre avec *preview* dans cette playlist.");

    games.set(channelId, { playlistId: plId, queue, current: null, scores: new Map(), ownerId: uid });

    await interaction.reply(`🎮 **Blind test lancé !** ${queue.length} manches. Utilise \`/blindtest guess\` pour répondre.`);

    return nextRound(interaction);
  } catch (e) {
    console.error("blindtest start error:", e?.body || e);
    return interaction.reply("❌ Impossible de démarrer le blind test.");
  }
}

async function nextRound(interaction) {
  const g = games.get(interaction.channelId);
  if (!g) return;

  const track = g.queue.shift();
  if (!track) {
    // fin de jeu
    const scores = [...g.scores.entries()].sort((a,b)=>b[1]-a[1]);
    const podium = scores.length ? scores.map(([u,s],i)=>`**${i+1}.** <@${u}> — ${s} pts`).join("\n") : "Personne 😅";
    await interaction.followUp({ content: `🏁 **Fin !**\n${podium}` });
    games.delete(interaction.channelId);
    return;
  }

  g.current = track;
  const embed = new EmbedBuilder()
    .setColor(0x1DB954)
    .setTitle("🎵 Devine le titre ou l’artiste !")
    .setDescription(`[Écouter l’extrait](${track.preview_url}) (30s)`)
    .setThumbnail(track.album?.images?.[0]?.url || null)
    .setFooter({ text: "Réponds avec /blindtest guess" });

  await interaction.followUp({ embeds: [embed] });
}

async function guess(interaction) {
  const g = games.get(interaction.channelId);
  if (!g || !g.current) return interaction.reply({ content: "❌ Pas de manche en cours.", ephemeral: true });

  const ans = interaction.options.getString("reponse").toLowerCase().trim();
  const title = g.current.name.toLowerCase();
  const artists = (g.current.artists || []).map(a => a.name.toLowerCase());

  const ok = title.includes(ans) || artists.some(a => a.includes(ans)) || ans.includes(title);
  if (!ok) return interaction.reply({ content: "❌ Faux !", ephemeral: true });

  // point + reveal + prochaine manche
  const prev = g.scores.get(interaction.user.id) || 0;
  g.scores.set(interaction.user.id, prev + 1);

  await interaction.reply(`✅ **Bravo ${interaction.user} !** C'était **${g.current.name}** — ${g.current.artists.map(a=>a.name).join(", ")}`);
  return nextRound(interaction);
}

async function stop(interaction) {
  const g = games.get(interaction.channelId);
  if (!g) return interaction.reply("ℹ️ Pas de blind test en cours.");
  if (interaction.user.id !== g.ownerId) return interaction.reply("⛔ Seul l’hôte peut arrêter la partie.");

  games.delete(interaction.channelId);
  return interaction.reply("🛑 Blind test arrêté.");
}
