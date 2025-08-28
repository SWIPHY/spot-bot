import 'dotenv/config';
import { REST, Routes } from 'discord.js';

const commands = [
  {
    name: 'play',
    description: 'Jouer une musique via mot-clé ou URL',
    options: [{ name: 'query', type: 3, description: 'Recherche ou URL', required: true }],
  },
  { name: 'stop', description: 'Stopper et vider la file' },
  { name: 'skip', description: 'Passer au suivant' },
  { name: 'pause', description: 'Mettre en pause' },
  { name: 'resume', description: 'Reprendre' },
];

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

async function main() {
  if (!process.env.DISCORD_CLIENT_ID || !process.env.GUILD_ID) {
    console.error('Variables manquantes (DISCORD_TOKEN, DISCORD_CLIENT_ID, GUILD_ID)');
    process.exit(1);
  }
  await rest.put(
    Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.GUILD_ID),
    { body: commands },
  );
  console.log('✅ Slash commands enregistrées.');
}
main().catch((e) => {
  console.error('register error', e);
  process.exit(1);
});
