// scripts/register-commands.js
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';
import dotenv from 'dotenv';
import { REST, Routes } from 'discord.js';
import dns from 'node:dns';
dns.setDefaultResultOrder('ipv4first');

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// charge explicitement ../.env (peu importe d’où tu lances le script)
dotenv.config({ path: path.join(__dirname, '../.env') });

// === vars ===
const DISCORD_TOKEN = process.env.DISCORD_TOKEN;
const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID; // Application ID
const GUILD_ID = process.env.GUILD_ID;                   // optionnel (pour registres "guild")

if (!DISCORD_TOKEN || !DISCORD_CLIENT_ID) {
  console.error('❌ Vars manquantes. Il faut au moins DISCORD_TOKEN et DISCORD_CLIENT_ID (Application ID).');
  process.exit(1);
}

// === load commands ===
const commandsDir = path.join(__dirname, '..', 'src', 'commands'); // adapte si besoin
const files = fs.readdirSync(commandsDir).filter(f => f.endsWith('.js'));

const seen = new Set();
const slashDefs = [];
for (const f of files) {
  const mod = await import(pathToFileURL(path.join(commandsDir, f)).href);

  const name = mod.data?.name || mod.name || mod.data?.toJSON?.()?.name;
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

console.log('📦 commandes prêtes:', [...seen].join(', ') || '(aucune)');
console.log(`🪪 AppID: ${DISCORD_CLIENT_ID}${GUILD_ID ? ` | Guild: ${GUILD_ID}` : ' | Global'}`);

// === register ===
const rest = new REST({ version: '10' }).setToken(DISCORD_TOKEN);

try {
  console.log('⏳ Enregistrement des commandes…');
  if (GUILD_ID) {
    await rest.put(
      Routes.applicationGuildCommands(DISCORD_CLIENT_ID, GUILD_ID),
      { body: slashDefs },
    );
    console.log('✅ Commands (guild) enregistrées pour', GUILD_ID);
  } else {
    // ⚠️ global = un seul param: applicationId
    await rest.put(
      Routes.applicationCommands(DISCORD_CLIENT_ID),
      { body: slashDefs },
    );
    console.log('✅ Commands (global) enregistrées');
  }
} catch (e) {
  console.error('❌ register-commands error:', e);
  process.exit(1);
}
