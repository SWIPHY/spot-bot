import 'dotenv/config';
import express from 'express';
import {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
  REST,
  Routes,
  EmbedBuilder,
} from 'discord.js';
import { getOrCreateGuildPlayer } from './core/player.js';
import { resolveTrack } from './util/resolveTrack.js';
import { logToDiscord } from './util/logger.js';
import playdl from "play-dl";
import { execSync } from "node:child_process";
import { ensureFfmpeg } from './util/ffmpeg.js';
await ensureFfmpeg(); // fixe process.env.FFMPEG_PATH et log le chemin retenu

try {
  const v = execSync("ffmpeg -version", { stdio: ["ignore","pipe","ignore"] })
    .toString().split("\n")[0];
  console.log("[ffmpeg] OK ->", v);
} catch {
  console.error("[ffmpeg] introuvable !");
}

const YT_COOKIE = process.env.YT_COOKIE?.trim();
const YT_ID = process.env.YT_CLIENT_ID?.trim(); // c’est ton x-youtube-identity-token

if (YT_COOKIE) {
  // Donne les credentials à play-dl (ils seront utilisés pour toutes les requêtes)
  playdl.setToken({
    youtube: {
      cookie: YT_COOKIE,
      identityToken: YT_ID || undefined,
    },
  });
  console.log("[yt] play-dl: cookie + identity token configurés");
} else {
  console.warn("[yt] ATTENTION: pas de YT_COOKIE dans l'env");
}

const app = express();
app.get('/', (_req, res) => res.send('OK'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('[web] listening on', PORT));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
  ],
  partials: [Partials.Channel],
});

globalThis.discordClient = client;
client.commands = new Collection();

// ---- Commandes en mémoire (play / stop / skip / pause / resume)
client.commands.set('play', {
  data: { name: 'play', description: 'Jouer une musique via mot-clé ou URL', options: [{ name: 'query', type: 3, description: 'Recherche ou URL', required: true }] },
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: false });
    const query = interaction.options.getString('query', true).trim();

    let track;
    try {
      track = await resolveTrack(query);
    } catch (e) {
      await interaction.editReply('❌ Oups, erreur pendant la résolution du titre (check logs).');
      await logToDiscord(`resolveTrack error: ${e?.message || e}`);
      return;
    }

    if (!track) {
      await interaction.editReply('❌ Rien trouvé pour ta recherche.');
      return;
    }

    // Voice channel de l’utilisateur
    const member = await interaction.guild.members.fetch(interaction.user.id);
    const voiceChannel = member?.voice?.channel;
    if (!voiceChannel) {
      await interaction.editReply('❌ Tu dois être connecté(e) à un salon vocal.');
      return;
    }

    try {
      const gp = getOrCreateGuildPlayer(interaction.guild, interaction.channel);
      const status = await gp.addAndPlay(track, voiceChannel);

      const emb = new EmbedBuilder()
        .setColor(0x00e0ff)
        .setDescription(status === 'started'
          ? `▶️ **Je joue**: ${track.title}`
          : `➕ **Ajouté à la file**: ${track.title}`)
        .setURL(track.url);

      await interaction.editReply({ embeds: [emb] });
    } catch (e) {
      await interaction.editReply('❌ Erreur /play: une erreur interne s’est produite.');
      await logToDiscord(`Erreur /play: ${e?.message || e}`);
    }
  },
});

client.commands.set('stop', {
  data: { name: 'stop', description: 'Stopper et vider la file' },
  async execute(interaction) {
    await interaction.deferReply();
    const gp = getOrCreateGuildPlayer(interaction.guild, interaction.channel);
    gp.stop();
    await interaction.editReply('🛑 Lecture arrêtée & file vidée.');
  },
});

client.commands.set('skip', {
  data: { name: 'skip', description: 'Passer au suivant' },
  async execute(interaction) {
    await interaction.deferReply();
    const gp = getOrCreateGuildPlayer(interaction.guild, interaction.channel);
    await gp.skip();
    await interaction.editReply('⏭️ Skip demandé.');
  },
});

client.commands.set('pause', {
  data: { name: 'pause', description: 'Mettre en pause' },
  async execute(interaction) {
    await interaction.deferReply();
    const gp = getOrCreateGuildPlayer(interaction.guild, interaction.channel);
    gp.pause();
    await interaction.editReply('⏸️ Pause.');
  },
});

client.commands.set('resume', {
  data: { name: 'resume', description: 'Reprendre' },
  async execute(interaction) {
    await interaction.deferReply();
    const gp = getOrCreateGuildPlayer(interaction.guild, interaction.channel);
    gp.resume();
    await interaction.editReply('▶️ Reprise.');
  },
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  const cmd = client.commands.get(interaction.commandName);
  if (!cmd) return;
  try {
    await cmd.execute(interaction);
  } catch (err) {
    await logToDiscord(`Erreur interaction: ${err?.message || err}`);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply('❌ Oups, erreur interne.');
    } else {
      await interaction.reply({ content: '❌ Oups, erreur interne.', ephemeral: true });
    }
  }
});

client.once('ready', () => {
  console.log(`[bot] connecté en tant que ${client.user.tag}`);
  logToDiscord('✅ Bot prêt.');
});

client.login(process.env.DISCORD_TOKEN);
