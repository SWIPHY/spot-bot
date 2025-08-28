import "dotenv/config";
import { Client, GatewayIntentBits, Collection, InteractionType } from "discord.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { startSpotifyServer } from "./spotify-server.js";
import { initLogger, logToDiscord } from "./util/logger.js";
import { MusicQueue } from "./core/queue.js";
import { GuildPlayer } from "./core/player.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

/* -------- Chargement dynamique des commandes -------- */
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

/* -------- State par serveur (queue + player) -------- */
const states = new Map();
/** crée et mémorise le state si absent */
function createGuildState(guild, textChannel) {
  let st = states.get(guild.id);
  if (st) return st;

  const queue = new MusicQueue(guild.id);
  const player = new GuildPlayer(guild, queue, textChannel);
  st = { queue, player };
  states.set(guild.id, st);
  return st;
}

/* -------- Events -------- */
client.once("ready", () => {
  console.log(`✅ Connecté en ${client.user.tag}`);
  initLogger(client);
  logToDiscord("🚀 Bot démarré et connecté !");
});

client.on("interactionCreate", async (interaction) => {
  try {
    // Autocomplete
    if (interaction.type === InteractionType.ApplicationCommandAutocomplete) {
      const c = commands.get(interaction.commandName);
      if (c?.autocomplete) return c.autocomplete(interaction);
      return;
    }

    if (!interaction.isChatInputCommand()) return;
    const cmd = commands.get(interaction.commandName);
    if (!cmd?.execute) {
      return interaction.reply({ content: "Commande inconnue.", ephemeral: true });
    }

    // Contexte réel avec factory valide
    const ctx = {
      states,
      createGuildState: (guild, textChannel) => createGuildState(guild, textChannel),
    };

    await cmd.execute(interaction, ctx);
  } catch (e) {
    console.error(e);
    logToDiscord(`❌ Erreur interaction: ${e?.message || e}`);
    if (interaction.deferred || interaction.replied) {
      interaction.editReply("❌ Oups, erreur interne.");
    } else {
      interaction.reply({ content: "❌ Oups, erreur interne.", ephemeral: true });
    }
  }
});

/* -------- Start -------- */
client.login(process.env.DISCORD_TOKEN);
startSpotifyServer();
