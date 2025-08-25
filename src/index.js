import 'dotenv/config';
import { Client, GatewayIntentBits, Collection, InteractionType } from 'discord.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startSpotifyServer } from './spotify-server.js';
import { initLogger, logToDiscord } from './util/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

// Charge toutes les commandes dynamiquement (compatible Windows)
const commands = new Collection();
const commandsDir = path.join(__dirname, 'commands');
for (const f of fs.readdirSync(commandsDir).filter(f => f.endsWith('.js'))) {
  const mod = await import(pathToFileURL(path.join(commandsDir, f)).href);
  const name = mod.data?.name || mod.name;
  if (!name || !mod.execute) {
    console.warn('⚠️ commande ignorée (pas de name/execute):', f);
    continue;
  }
  commands.set(name, mod);
}

client.once('ready', () => {
  console.log(`✅ Connecté en ${client.user.tag}`);
  initLogger(client);
  logToDiscord('🚀 Bot démarré et connecté !');
});

client.on('interactionCreate', async (interaction) => {
  try {
    // Autocomplete
    if (interaction.type === InteractionType.ApplicationCommandAutocomplete) {
      const c = commands.get(interaction.commandName);
      if (c?.autocomplete) return c.autocomplete(interaction);
      return;
    }

    // Slash commands
    if (!interaction.isChatInputCommand()) return;
    const cmd = commands.get(interaction.commandName);
    if (!cmd?.execute) {
      return interaction.reply({ content: 'Commande inconnue.', ephemeral: true });
    }

    const ctx = { states: new Map(), createGuildState: () => ({}) };
    await cmd.execute(interaction, ctx);

    // sous ton try { ... } avant le catch:
    if (interaction.isButton?.()) {
      // spotify_playlist buttons
      const pl = commands.get("spotify_playlist");
      if (pl?.onButton && interaction.customId.startsWith("pl_")) {
        await pl.onButton(interaction); 
        return;
      }
    }
  } 
  
  catch (e) {
    logToDiscord(`❌ Erreur: ${e.message}`);
    console.error(e);
    if (interaction.deferred || interaction.replied) {
      interaction.editReply('❌ Oups, erreur interne.');
    } else {
      interaction.reply({ content: '❌ Oups, erreur interne.', ephemeral: true });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);

// Lance le serveur OAuth Spotify
startSpotifyServer();
