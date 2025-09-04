import "dotenv/config";
import { Client, GatewayIntentBits, Collection, InteractionType } from "discord.js";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { startSpotifyServer } from "./spotify-server.js";
import { initLogger, makeLogger } from "./util/logger.js";
import getOrCreateGuildPlayer from "./core/player.js";
import { resolveTrack } from "./util/resolveTrack.js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

// --- Chargement commandes dynamiques ---
const commands = new Collection();
const commandsDir = path.join(__dirname, "commands");
for (const f of fs.readdirSync(commandsDir).filter((f) => f.endsWith(".js"))) {
  const mod = await import(path.join(commandsDir, f));
  const name = mod.data?.name || mod.name;
  if (!name || !mod.execute) {
    console.warn("⚠️ commande ignorée:", f);
    continue;
  }
  commands.set(name, mod);
}

client.once("ready", () => {
  console.log(`✅ Connecté en ${client.user.tag}`);
  initLogger(client);
});

// --- Gestion des interactions ---
client.on("interactionCreate", async (interaction) => {
  const logger = makeLogger(client);

  try {
    if (interaction.type === InteractionType.ApplicationCommandAutocomplete) {
      const c = commands.get(interaction.commandName);
      if (c?.autocomplete) return c.autocomplete(interaction);
      return;
    }

    if (!interaction.isChatInputCommand()) return;
    const cmd = commands.get(interaction.commandName);
    if (!cmd?.execute) return interaction.reply({ content: "Commande inconnue.", ephemeral: true });

    // Contexte custom
    const ctx = {
      client,
      logger,
      getPlayer: (ch) => getOrCreateGuildPlayer(interaction.guild, ch, logger),
      resolveTrack,
    };

    await cmd.execute(interaction, ctx);
  } catch (e) {
    logger.error({ title: "interaction error", desc: e?.message || e });
    if (interaction.deferred || interaction.replied) {
      interaction.editReply("❌ Erreur interne.");
    } else {
      interaction.reply({ content: "❌ Erreur interne.", ephemeral: true }).catch(() => {});
    }
  }
});

client.login(process.env.DISCORD_TOKEN);

// Lance serveur OAuth Spotify
startSpotifyServer();
