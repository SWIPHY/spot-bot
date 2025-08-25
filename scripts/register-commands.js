import 'dotenv/config';
import { REST, Routes } from 'discord.js';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const commandsDir = path.join(__dirname, '..', 'src', 'commands');
const files = fs.readdirSync(commandsDir).filter(f => f.endsWith('.js'));

const slashDefs = [];
for (const f of files) {
  const absPath = path.join(commandsDir, f);
  // 👉 convertit C:\...\monfichier.js en file:///C:/... pour ESM
  const mod = await import(pathToFileURL(absPath).href);

  const data = mod.data?.toJSON?.() || mod.data;
  if (!data?.name) {
    console.warn('⚠️  command sans data.name :', f);
    continue;
  }
  slashDefs.push(data);
}

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
