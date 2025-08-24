import 'dotenv/config';
import { Client, GatewayIntentBits, Collection, InteractionType } from 'discord.js';
import { MusicQueue } from './core/queue.js';
import { GuildPlayer } from './core/player.js';
import * as playCmd from './commands/play.js';
import * as skipCmd from './commands/skip.js';
import * as pauseCmd from './commands/pause.js';
import * as resumeCmd from './commands/resume.js';
import * as queueCmd from './commands/queue.js';
import * as stopCmd from './commands/stop.js';
import * as shuffleCmd from './commands/shuffle.js';
import * as loopCmd from './commands/loop.js';

import { startSpotifyServer } from './spotify-server.js';
import * as spotify_link from './commands/spotify_link.js';
import * as spotify_me from './commands/spotify_me.js';
import * as spotify_now from './commands/spotify_now.js';
import * as spotify_add from './commands/spotify_add.js';
import * as blindtest from './commands/blindtest.js';
import * as lyrics from './commands/lyrics.js';



const client = new Client({
intents: [
GatewayIntentBits.Guilds,
GatewayIntentBits.GuildVoiceStates,
],
});


// Registry maison (simple)
const commands = new Collection();
[playCmd, skipCmd, pauseCmd, resumeCmd, queueCmd, stopCmd, shuffleCmd, loopCmd]
.forEach((c) => commands.set((c.data?.name) || c.data.name || c.name, c));
[ /* …tes commandes existantes… */, spotify_link, spotify_me, spotify_now, spotify_add, blindtest, lyrics ]
  .forEach(c => commands.set((c.data?.name) || c.name, c));


// State par serveur
const states = new Map();
const createGuildState = (guild, textChannel) => {
const queue = new MusicQueue(guild.id);
const player = new GuildPlayer(guild, queue, textChannel);
const state = { queue, player };
states.set(guild.id, state);
return state;
};


client.on('ready', () => console.log(`✅ Connecté en ${client.user.tag}`));


client.on('interactionCreate', async (interaction) => {
try {
// Autocomplete handler
if (interaction.type === InteractionType.ApplicationCommandAutocomplete) {
const c = commands.get(interaction.commandName);
if (c?.autocomplete) return c.autocomplete(interaction);
return;
}


if (!interaction.isChatInputCommand()) return;
const cmd = commands.get(interaction.commandName);
if (!cmd?.execute) return interaction.reply('Commande inconnue.');


await cmd.execute(interaction, { states, createGuildState });
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

startSpotifyServer();
