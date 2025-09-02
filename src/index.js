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
  SlashCommandBuilder
} from "discord.js";
import getOrCreateGuildPlayer from "./core/player.js";
import resolveTrack from "./util/resolveTrack.js";
import { initLogger, logToDiscord } from "./util/logger.js";
import play from "play-dl";

// ---------- YouTube (cookies) ----------
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
} else {
  console.warn("[yt] ATTENTION: pas de YT_COOKIE dans l'env");
}

// ---------- Discord client ----------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates
  ],
  partials: [Partials.Channel]
});

client.once("ready", async () => {
  await initLogger(client, process.env.LOG_CHANNEL_ID);
  console.log(`[bot] connecté en tant que ${client.user.tag}`);
});

// ---------- Slash command /play (auto-register si GUILD_ID présent) ----------
async function registerCommands() {
  try {
    const rest = new REST({ version: "10" }).setToken(process.env.DISCORD_TOKEN);
    const commands = [
      new SlashCommandBuilder()
        .setName("play")
        .setDescription("Lire un titre YouTube (url ou mots-clés)")
        .addStringOption(o => o.setName("query").setDescription("URL ou recherche").setRequired(true)),
      new SlashCommandBuilder()
        .setName("stop")
        .setDescription("Arrête et vide la file")
    ].map(c => c.toJSON());

    if (process.env.GUILD_ID) {
      await rest.put(
        Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.GUILD_ID),
        { body: commands }
      );
      console.log("[slash] commandes (guild) enregistrées");
    } else {
      await rest.put(
        Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
        { body: commands }
      );
      console.log("[slash] commandes (global) enregistrées");
    }
  } catch (err) {
    console.warn("[slash] register error:", err?.message || err);
  }
}
await registerCommands();

// ---------- Handlers ----------
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  try {
    if (interaction.commandName === "play") {
      const query = interaction.options.getString("query");

      // must be in a voice channel
      const voice = interaction.member?.voice?.channel;
      if (!voice) {
        return interaction.reply({ content: "🔊 Rejoins un salon vocal d'abord.", ephemeral: true });
      }

      await interaction.deferReply();

      const track = await resolveTrack(query);
      const gp = getOrCreateGuildPlayer(interaction.guild, interaction.channel);
      await gp.join(voice);
      gp.enqueue(track);

      await interaction.editReply(`▶️ Ajouté à la file : **${track.title}**`);
      return;
    }

    if (interaction.commandName === "stop") {
      const gp = getOrCreateGuildPlayer(interaction.guild, interaction.channel);
      gp.stop();
      return interaction.reply("⏹️ Arrêté.");
    }
  } catch (err) {
    await interaction.reply({ content: "❌ Oups, erreur pendant la résolution du titre.", ephemeral: true }).catch(() => {});
    await logToDiscord("Erreur interaction", err?.stack || String(err), { level: "error" });
  }
});

// ---------- Logs process ----------
process.on("unhandledRejection", (reason) =>
  logToDiscord("UnhandledRejection", String(reason?.stack || reason), { level: "error" })
);
process.on("uncaughtException", (err) =>
  logToDiscord("UncaughtException", String(err?.stack || err), { level: "error" })
);

// ---------- Keep-alive web ----------
const app = express();
const PORT = process.env.PORT || 8080;
app.get("/", (_, res) => res.send("Bot en ligne."));
app.listen(PORT, () => console.log(`[web] listening on ${PORT}`));

// ---------- Login ----------
client.login(process.env.DISCORD_TOKEN);
