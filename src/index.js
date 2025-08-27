import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { Client, GatewayIntentBits, Collection, InteractionType } from "discord.js";
import play from "play-dl";
import { startSpotifyServer } from "./spotify-server.js";
import { initLogger, logToDiscord } from "./util/logger.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ---------- Discord client ----------
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

// ---------- Commands dynamic load ----------
const commands = new Collection();
const commandsDir = path.join(__dirname, "commands");
for (const f of fs.readdirSync(commandsDir).filter((f) => f.endsWith(".js"))) {
  const mod = await import(path.join(commandsDir, f));
  const name = mod.data?.name || mod.name;
  if (!name || !mod.execute) {
    console.warn("⚠️ commande ignorée (pas de name/execute):", f);
    continue;
  }
  commands.set(name, mod);
}

// ---------- play-dl token (YouTube cookie) ----------
const ua =
  "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
if (process.env.YT_COOKIE) {
  try {
    play.setToken({
      youtube: { cookie: process.env.YT_COOKIE, hl: "fr", gl: "FR", userAgent: ua },
    });
    console.log("✅ play-dl YouTube cookie initialisé");
  } catch (e) {
    console.warn("⚠️ setToken YouTube a échoué:", e?.message || e);
  }
}

// ---------- Events ----------
client.once("ready", () => {
  console.log(`✅ Connecté en ${client.user.tag}`);
  initLogger(client);
  logToDiscord("🚀 Bot démarré et connecté !");
});

client.on("interactionCreate", async (interaction) => {
  try {
    if (interaction.type === InteractionType.ApplicationCommandAutocomplete) {
      const c = commands.get(interaction.commandName);
      if (c?.autocomplete) return c.autocomplete(interaction);
      return;
    }
    if (!interaction.isChatInputCommand()) return;

    const cmd = commands.get(interaction.commandName);
    if (!cmd?.execute)
      return interaction.reply({ content: "Commande inconnue.", ephemeral: true });

    // Contexte minimal (ton impl peut remplacer)
    const ctx = { states: new Map(), createGuildState: () => ({}) };
    await cmd.execute(interaction, ctx);
  } catch (e) {
    console.error(e);
    if (interaction.deferred || interaction.replied) {
      interaction.editReply("❌ Oups, erreur interne.");
    } else {
      interaction.reply({ content: "❌ Oups, erreur interne.", ephemeral: true });
    }
    logToDiscord(`❌ Erreur interaction: ${e?.message || e}`);
  }
});

// ---------- Login + Spotify OAuth server ----------
client.login(process.env.DISCORD_TOKEN);
startSpotifyServer();
