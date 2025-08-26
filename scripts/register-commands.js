import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const token = process.env.DISCORD_TOKEN;
const clientId = process.env.DISCORD_CLIENT_ID;
const guildId = process.env.GUILD_ID;

const commandsDir = path.join(__dirname, '..', 'src', 'commands');
const files = fs.readdirSync(commandsDir).filter(f => f.endsWith('.js'));

const seen = new Set();
const slashDefs = [];
for (const f of files) {
  const abs = path.join(commandsDir, f);
  const mod = await import(pathToFileURL(abs).href);

  const name = mod.data?.name || mod.name || mod.data?.toJSON?.().name;
  if (!name || !mod.execute) {
    console.warn('⚠️ ignoré (pas de name/execute):', f);
    continue;
  }
  if (seen.has(name)) {
    console.warn(`⚠️ doublon "${name}" ignoré → fichier:`, f);
    continue;
  }
  seen.add(name);

  const json = mod.data?.toJSON?.() || mod.data;
  slashDefs.push(json);
}

console.log('📦 commandes prêtes:', [...seen].join(', '));

const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

(async () => {
  try {
    if (process.env.GUILD_ID) {
      await rest.put(
        Routes.applicationGuildCommands(process.env.DISCORD_CLIENT_ID, process.env.GUILD_ID),
        { body: slashDefs },
      );
      console.log('✅ Commands (guild) enregistrées pour', process.env.GUILD_ID);
    } else {
      await rest.put(
        Routes.applicationCommands(process.env.DISCORD_CLIENT_ID),
        { body: slashDefs },
      );
      console.log('✅ Commands (global) enregistrées');
    }
  } catch (e) {
    console.error('❌ register-commands error:', e);
    process.exit(1);
  }
})();
