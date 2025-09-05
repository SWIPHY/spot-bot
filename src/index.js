import { ensureFfmpeg } from "./util/ffmpeg.js";        // fixe process.env.FFMPEG_PATH et log le binaire utilisé
await ensureFfmpeg();

import "dotenv/config";
import express from "express";
import {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
  Routes,
  REST,
  EmbedBuilder,
} from "discord.js";

import getOrCreateGuildPlayer from "./core/player.js";
import resolveTrack from "./util/resolveTrack.js";
import { logToDiscord } from "./util/logger.js";
import play from "play-dl";

// --- play-dl : cookies / identity token depuis .env ---
const YT_COOKIE = process.env.YT_COOKIE?.trim();
const YT_ID = process.env.YT_CLIENT_ID?.trim(); // x-youtube-identity-token
if (YT_COOKIE) {
  play.setToken({
    youtube: {
      cookie: YT_COOKIE,
      identityToken: YT_ID || undefined,
    },
  });
  console.log("[yt] play-dl: cookie + identity token configurés");
}

// --- petit serveur HTTP pour "keep-alive" sur Railway ---
const app = express();
const PORT = process.env.PORT || 8080;
app.get("/", (_, res) => res.send("OK"));
app.listen(PORT, () => console.log(`[web] listening on ${PORT}`));

// --- Discord client ---
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [Partials.Channel],
});

// évènement recommandé (évite l’avertissement v15)
client.on("clientReady", (c) => {
  logToDiscord("INFO", `[bot] connecté en tant que ${c.user.tag}`);
});

// compat pour v14: certains environnements n’émettent que "ready"
client.once("ready", (c) => {
  logToDiscord("INFO", `[bot] connecté en tant que ${c.user.tag}`);
});

// --- gestion slash-commands (Play uniquement ici) ---
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const { commandName } = interaction;

  if (commandName === "play") {
    const query = interaction.options.getString("query", true);

    try {
      // doit être dans un salon vocal
      const voiceChannel = interaction.member?.voice?.channel;
      if (!voiceChannel) {
        return interaction.reply({
          content: "❌ Tu dois être dans un salon vocal.",
          ephemeral: true,
        });
      }

      const gp = getOrCreateGuildPlayer(interaction.guild, interaction.channel);
      gp.connect(voiceChannel);

      const result = await resolveTrack(query, interaction.user);

      if (!result) {
        await interaction.reply({
          content: "❌ Rien trouvé pour cette requête.",
          ephemeral: true,
        });
        return;
      }

      if (result.kind === "many") {
        gp.enqueueMany(result.tracks);
        await interaction.reply({
          content: `➕ **${result.tracks.length}** titres ajoutés à la file${
            result.title ? ` (playlist **${result.title}**)` : ""
          }.`,
          ephemeral: false,
        });
        logToDiscord(
          "INFO",
          `+ Playlist ajoutée (${result.tracks.length} titres)${
            result.title ? `: ${result.title}` : ""
          }`
        );
      } else {
        await gp.playOrEnqueue(result.track);
        await interaction.reply({
          content: `🎵 Ajouté à la file: **${result.track.title || "Unknown"}**`,
          ephemeral: false,
        });
        logToDiscord("INFO", `+ Ajouté à la file: ${result.track.title || "Unknown"}`);
      }
    } catch (err) {
      logToDiscord(
        "ERROR",
        "Erreur pendant la résolution/lecture",
        err
      );
      try {
        await interaction.reply({
          content: "❌ Oups, erreur pendant la résolution du titre.",
          ephemeral: true,
        });
      } catch {}
    }
  }
});

// --- connexion ---
client.login(process.env.DISCORD_TOKEN);
