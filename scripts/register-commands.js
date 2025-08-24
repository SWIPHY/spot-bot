import 'dotenv/config';
import { REST } from '@discordjs/rest';
import { Routes, ApplicationCommandOptionType } from 'discord-api-types/v10';

const commands = [
  {
    name: 'play',
    description: 'Cherche et joue un son',
    options: [
      {
        name: 'query',
        description: 'Titre ou URL',
        type: ApplicationCommandOptionType.String,
        required: true,
        autocomplete: true,
      },
    ],
  },
  { name: 'skip', description: 'Passe au prochain track' },
  { name: 'pause', description: 'Met en pause' },
  { name: 'resume', description: 'Reprend la lecture' },
  { name: 'queue', description: "Affiche la file d'attente" },
  { name: 'stop', description: 'Stoppe et vide la file' },
  { name: 'shuffle', description: 'Mélange la queue' },
  {
    name: 'loop',
    description: 'Boucle la lecture',
    options: [
      {
        name: 'mode',
        description: 'off | track | queue',
        type: ApplicationCommandOptionType.String,
        required: true,
        choices: [
          { name: 'off', value: 'off' },
          { name: 'track', value: 'track' },
          { name: 'queue', value: 'queue' },
        ],
      },
    ],
  },

  // --- Spotify ---
  { name: 'spotify_link', description: 'Lier ton compte Spotify' },
  { name: 'spotify_me', description: 'Voir mon profil Spotify' },
  { name: 'spotify_now', description: 'Voir ce que j’écoute en ce moment' },
  { name: 'spotify_add', description: 'Ajouter le son en cours à la playlist commune' },

  // --- Blindtest ---
  {
    name: 'blindtest',
    description: 'Blindtest Spotify (30s preview)',
    options: [
      {
        name: 'action',
        description: 'start/stop',
        type: ApplicationCommandOptionType.String,
        required: true,
        choices: [
          { name: 'start', value: 'start' },
          { name: 'stop', value: 'stop' },
        ],
      },
    ],
  },

  // --- Lyrics ---
  {
    name: 'lyrics',
    description: 'Paroles',
    options: [
      {
        name: 'query',
        description: 'titre/artiste',
        type: ApplicationCommandOptionType.String,
        required: true,
      },
    ],
  },
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    if (process.env.GUILD_ID) {
      await rest.put(
        Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
        { body: commands },
      );
      console.log('✓ Slash (guild) enregistrées');
    } else {
      await rest.put(
        Routes.applicationCommands(process.env.CLIENT_ID),
        { body: commands },
      );
      console.log('✓ Slash (global) enregistrées');
    }
  } catch (e) {
    console.error(e);
  }
})();
