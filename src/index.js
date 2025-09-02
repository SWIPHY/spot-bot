import { ensureFfmpeg } from "./util/ffmpeg.js";
import "dotenv/config";
import express from "express";
import {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
} from "discord.js";
import { getOrCreateGuildPlayer } from "./core/player.js";
import { resolveTrack } from "./util/resolveTrack.js";
import { logToDiscord } from "./util/logger.js";
import playdl from "play-dl";
import { execSync } from "node:child_process";

// --- FFmpeg ---------------------------------------------------------
await ensureFfmpeg();
try {
  const v = execSync("ffmpeg -version", { stdio: ["ignore", "pipe", "ignore"] })
    .toString()
    .split("\n")[0];
  console.log("[ffmpeg] ok ->", v);
} catch {
  console.error("[ffmpeg] introuvable !");
}

// --- YouTube (play-dl) ----------------------------------------------
const YT_COOKIE = process.env.YT_COOKIE?.trim();
const YT_ID = process.env.YT_CLIENT_ID?.trim(); // x-youtube-identity-token

if (YT_COOKIE) {
  playdl.setToken({
    youtube: {
      cookie: YT_COOKIE,
      identityToken: YT_ID || undefined,
    },
  });
  console.log("[yt] play-dl: cookie + identity token configurés");
} else {
  console.warn("[yt] ATTENTION: pas de YT_COOKIE dans l'env");
}

// --- HTTP keep-alive ------------------------------------------------
const app = express();
const PORT = process.env.PORT || 8080;
app.get("/", (_req, res) => res.send("OK"));
app.listen(PORT, () => console.log("[web] listening on", PORT));

// --- Discord client (INTENTS corrigés) ------------------------------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent, // <- privileged: activer dans le portail Discord
  ],
  partials: [Partials.Channel, Partials.GuildMember, Partials.Message],
});

client.commands = new Collection();

client.once("ready", () => {
  console.log(`[bot] connecté en tant que ${client.user.tag}`);
});

// --- Exemple d’implémentation /play pour test -----------------------
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  if (interaction.commandName === "play") {
    const query = interaction.options.getString("query", true);

    try {
      const track = await resolveTrack(query);
      if (!track) {
        return interaction.reply({ content: "Rien trouvé.", ephemeral: true });
      }

      const gp = getOrCreateGuildPlayer(interaction.guild, interaction.channel);
      await gp.addAndPlay({
        title: track.title,
        url: track.url,
        requestedBy: interaction.user,
      });

      return interaction.reply(`Je joue: **${track.title}**`);
    } catch (err) {
      console.error("Erreur /play:", err);
      logToDiscord(`❌ Erreur /play: ${err?.message ?? err}`);
      return interaction.reply({
        content: "Oups, erreur pendant la résolution du titre.",
        ephemeral: true,
      });
    }
  }

  // Laisse tes autres commandes inchangées ici...
});

// --- Login ----------------------------------------------------------
const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error("Variables manquantes (DISCORD_TOKEN).");
  process.exit(1);
}
client.login(token);
