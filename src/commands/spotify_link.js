import { SlashCommandBuilder } from "discord.js";

export const data = new SlashCommandBuilder()
  .setName("spotify_link")
  .setDescription("Connecte ton compte Spotify");

function getBaseFromEnv() {
  const redirect = process.env.SPOTIFY_REDIRECT_URL || process.env.SPOTIFY_REDIRECT_URL;
  if (!redirect) throw new Error("SPOTIFY_REDIRECT_URL manquant");

  // force un vrai URL (avec protocole), et enlève /callback si présent
  const u = new URL(redirect.match(/^https?:\/\//) ? redirect : `https://${redirect}`);
  u.pathname = u.pathname.replace(/\/callback\/?$/, ""); // strip /callback
  u.search = "";
  u.hash = "";
  // garde un éventuel sous-chemin (ex: /api) sans trailing slash
  const basePath = u.pathname.replace(/\/$/, "");
  return `${u.origin}${basePath}`;
}

export async function execute(interaction) {
  try {
    const base = getBaseFromEnv(); // ex: https://spot-bot-production.up.railway.app
    const url = `${base}/link?user=${interaction.user.id}`;
    return interaction.reply({ content: `🔗 Autorise ici : ${url}` });
  } catch (e) {
    return interaction.reply({ content: `❌ ${e.message} sur le serveur.`});
  }
}
