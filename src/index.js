// src/index.js
import 'dotenv/config';
import { Client, GatewayIntentBits, Partials, Events } from 'discord.js';
import play from 'play-dl';

/* ----------------------------- ENV CHECKS ----------------------------- */
function checkEnv() {
  const required = ['DISCORD_TOKEN', 'YT_COOKIE'];
  let ok = true;

  for (const key of required) {
    if (!process.env[key] || !String(process.env[key]).trim()) {
      console.error(`❌ [ENV] Variable manquante: ${key}`);
      ok = false;
    }
  }

  if (!ok) throw new Error('Certaines variables d’environnement sont manquantes.');

  console.log(`✅ [ENV] YT_COOKIE chargé (${process.env.YT_COOKIE.length} chars)`);
  if (process.env.YT_ID_TOKEN) {
    console.log(`✅ [ENV] YT_ID_TOKEN trouvé (${process.env.YT_ID_TOKEN.length} chars)`);
  } else {
    console.warn('⚠️ [ENV] Pas de YT_ID_TOKEN — risque de 403/410 sur certains liens.');
  }
}
checkEnv();

/* ------------------------ play-dl: configuration ----------------------- */
// On passe le cookie (et l’ID token si présent) à play-dl.
// NB: pas d’erreur si YT_ID_TOKEN est absent — juste moins fiable.
try {
  await play.setToken({
    youtube: {
      cookie: process.env.YT_COOKIE,
      identity_token: process.env.YT_ID_TOKEN || undefined,
    },
  });
  console.log('✅ [play-dl] Tokens YouTube configurés.');
} catch (e) {
  console.error('❌ [play-dl] setToken a échoué:', e?.message || e);
}

/* ------------------------------ DISCORD ------------------------------- */
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates, // nécessaire pour la voix
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,   // si tu lis des messages (pas requis pour les slash cmds)
  ],
  partials: [Partials.Channel],
});

client.once(Events.ClientReady, (c) => {
  console.log(`✅ Connecté en tant que ${c.user.tag}`);
});

/* ------------------------- ROUTAGE DES COMMANDES ---------------------- */
/**
 * Ce routeur charge “en douceur” tes handlers si les fichiers existent.
 * - ./commands/play.js   -> export default async function (interaction) {}
 * - ./commands/stop.js
 * - ./commands/skip.js
 * Si un fichier manque, on ne crashe pas : on répond proprement.
 */
async function loadHandler(name) {
  try {
    const mod = await import(`./commands/${name}.js`);
    return mod?.default || mod?.run || null;
  } catch {
    return null;
  }
}

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand?.()) return;

  try {
    const cmd = interaction.commandName;

    // Log minimal
    console.log(`➡️ /${cmd} par ${interaction.user.tag} dans #${interaction.channel?.name || '?'}`);

    const handler = await loadHandler(cmd);
    if (!handler) {
      await interaction.reply({ content: `❌ Commande \`/${cmd}\` indisponible sur ce déploiement.`, ephemeral: true });
      return;
    }

    // Exécuter le handler — il gère déjà ses propres erreurs normalement.
    await handler(interaction);
  } catch (err) {
    console.error('❌ Erreur interaction:', err?.stack || err);
    if (interaction.deferred || interaction.replied) {
      await interaction.followUp({ content: '❌ Oups, erreur interne.', ephemeral: true }).catch(() => {});
    } else {
      await interaction.reply({ content: '❌ Oups, erreur interne.', ephemeral: true }).catch(() => {});
    }
  }
});

/* ------------------------------ LIFECYCLE ----------------------------- */
process.on('unhandledRejection', (reason) => {
  console.error('⚠️ UnhandledRejection:', reason);
});
process.on('uncaughtException', (err) => {
  console.error('⚠️ UncaughtException:', err);
});

client.login(process.env.DISCORD_TOKEN).catch((e) => {
  console.error('❌ Login Discord échoué:', e?.message || e);
  process.exit(1);
});
