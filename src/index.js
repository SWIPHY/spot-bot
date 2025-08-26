// index.js
import 'dotenv/config';
import { Client, GatewayIntentBits, Collection, InteractionType } from 'discord.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { startSpotifyServer } from './spotify-server.js';
import { initLogger, logToDiscord } from './util/logger.js';
import { GuildPlayer } from './core/player.js';
import { MusicQueue } from './core/queue.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ====== CLIENT ======
const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});

// ====== CHARGEMENT COMMANDES ======
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

// ====== STATE PAR SERVEUR ======
const states = new Map();
/**
 * Crée/récupère le state pour un serveur donné.
 * @param {import('discord.js').Guild} guild
 * @param {import('discord.js').TextBasedChannel} textChannel
 */
function createGuildState(guild, textChannel) {
  const existing = states.get(guild.id);
  if (existing) return existing;

  const queue = new MusicQueue(guild.id);
  const player = new GuildPlayer(guild, queue, textChannel);
  const state = { queue, player };
  states.set(guild.id, state);
  return state;
}

// ====== READY ======
client.once('ready', () => {
  console.log(`✅ Connecté en ${client.user.tag}`);
  initLogger(client);
  logToDiscord('🚀 Bot démarré et connecté !');
});

// ====== INTERACTIONS ======
client.on('interactionCreate', async (interaction) => {
  try {
    // --- Autocomplete
    if (interaction.type === InteractionType.ApplicationCommandAutocomplete) {
      const c = commands.get(interaction.commandName);
      if (c?.autocomplete) return c.autocomplete(interaction);
      return;
    }

    // --- Routeur boutons (avant de filtrer les slash)
    if (interaction.isButton?.()) {
      // pagination/contrôles pour la commande spotify_playlist
      const pl = commands.get('spotify_playlist');
      if (pl?.onButton && interaction.customId?.startsWith?.('pl_')) {
        await pl.onButton(interaction);
        return;
      }
      // si t'as d'autres boutons, tu peux router ici
      return;
    }

    // --- Slash commands
    if (!interaction.isChatInputCommand?.()) return;

    const cmd = commands.get(interaction.commandName);
    if (!cmd?.execute) {
      return interaction.reply({ content: 'Commande inconnue.', ephemeral: true });
    }

    const guild = interaction.guild;
    const textChannel = interaction.channel;

    // Contexte passé aux commandes
    const ctx = {
      states,
      createGuildState: () => states.get(guild.id) || createGuildState(guild, textChannel),
    };

    await cmd.execute(interaction, ctx);
  } catch (e) {
    logToDiscord(`❌ Erreur: ${e.message}`);
    console.error(e);
    if (interaction.deferred || interaction.replied) {
      interaction.editReply('❌ Oups, erreur interne.');
    } else {
      interaction.reply({ content: '❌ Oups, erreur interne.', ephemeral: true });
    }
  }
});

// ====== LOGIN + SPOTIFY ======
client.login(process.env.DISCORD_TOKEN);
startSpotifyServer();
