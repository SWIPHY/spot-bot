import { ensureFfmpeg } from "./util/ffmpeg.js";
await ensureFfmpeg();

import "dotenv/config";
import express from "express";
import {
  Client,
  GatewayIntentBits,
  Partials,
  REST,
  Routes,
} from "discord.js";

import getOrCreateGuildPlayer from "./core/player.js";
import { resolveTrack } from "./util/resolveTrack.js";
import { initLogger, logToDiscord } from "./util/logger.js";
import play from "play-dl";

// Création du client Discord
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [Partials.Channel],
});

// Quand le bot est prêt
client.once("ready", async () => {
  await initLogger(client, process.env.LOG_CHANNEL_ID);
  await logToDiscord("Bot prêt", "Démarré et connecté.", { level: "info" });
  console.log(`[bot] connecté en tant que ${client.user.tag}`);
});

// Gestion des erreurs globales
process.on("unhandledRejection", async (reason) => {
  await logToDiscord("UnhandledRejection", String(reason?.stack || reason), { level: "error" });
});
process.on("uncaughtException", async (err) => {
  await logToDiscord("UncaughtException", String(err?.stack || err), { level: "error" });
});

// Commandes slash (exemple simplifié /play)
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isCommand()) return;

  if (interaction.commandName === "play") {
    const query = interaction.options.getString("query");
    try {
      const track = await resolveTrack(query);
      await interaction.reply(`▶️ Lecture : **${track.title}**`);
      // Ici tu ajoutes à la file d’attente avec getOrCreateGuildPlayer
    } catch (err) {
      await interaction.reply("❌ Oups, erreur pendant la résolution du titre.");
      await logToDiscord("Erreur /play", err?.stack || err?.message, { level: "error" });
    }
  }
});

// Serveur web (keep-alive)
const app = express();
const PORT = process.env.PORT || 8080;
app.get("/", (_, res) => res.send("Bot en ligne."));
app.listen(PORT, () => console.log(`[web] listening on ${PORT}`));

// Connexion à Discord
client.login(process.env.DISCORD_TOKEN);
