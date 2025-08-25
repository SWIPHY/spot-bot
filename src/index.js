import 'dotenv/config';
import { Client, GatewayIntentBits, Collection, InteractionType } from 'discord.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { startSpotifyServer } from './spotify-server.js';


const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);


const client = new Client({
intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildVoiceStates],
});


// Charge toutes les commandes dynamiquement
const commands = new Collection();
const commandsDir = path.join(__dirname, 'commands');
for (const f of fs.readdirSync(commandsDir).filter(f => f.endsWith('.js'))) {
const mod = await import(path.join(commandsDir, f));
const name = mod.data?.name || mod.name;
if (!name || !mod.execute) {
console.warn('⚠️ commande ignorée (pas de name/execute):', f);
continue;
}
commands.set(name, mod);
}


client.on('ready', () => console.log(`✅ Connecté en ${client.user.tag}`));


client.on('interactionCreate', async (interaction) => {
try {
if (interaction.type === InteractionType.ApplicationCommandAutocomplete) {
const c = commands.get(interaction.commandName);
if (c?.autocomplete) return c.autocomplete(interaction);
return;
}


if (!interaction.isChatInputCommand()) return;
const cmd = commands.get(interaction.commandName);
if (!cmd?.execute) return interaction.reply({ content: 'Commande inconnue.', ephemeral: true });


// Contexte light pour compat avec ta future logique
const ctx = { states: new Map(), createGuildState: () => ({}) };
await cmd.execute(interaction, ctx);
} catch (e) {
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
