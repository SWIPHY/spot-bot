import { ensureFfmpeg } from './util/ffmpeg.js'; // fixe process.env.FFMPEG_PATH
await ensureFfmpeg();

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
import { resolveTrack } from './util/resolveTrack.js'; // ta fonction existante
import { logToDiscord } from './util/logger.js';
import playdl from 'play-dl';
import { execSync } from 'node:child_process';

try {
  const v = execSync('ffmpeg -version', { stdio: ['ignore', 'pipe', 'ignore'] })
    .toString()
    .split('\n')[0];
  console.log(`[ffmpeg] ok ->`, v);
} catch {
  console.error('[ffmpeg] introuvable !');
}

// ---------- YouTube auth (cookies + identity token) ----------
const YT_COOKIE = process.env.YT_COOKIE?.trim();
const YT_ID = process.env.YT_CLIENT_ID?.trim(); // x-youtube-identity-token

if (YT_COOKIE) {
  playdl.setToken({
    youtube: {
      cookie: YT_COOKIE,
      identityToken: YT_ID || undefined,
    },
  });
  console.log('[yt] play-dl: cookie + identity token configurés');
} else {
  console.warn('[yt] ATTENTION: pas de YT_COOKIE dans l’env !');
}

// ---------- mini web pour “keep-alive” ----------
const app = express();
app.get('/', (_req, res) => res.send('ok'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log('[web] listening on', PORT));

// ---------- Discord ----------
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
  partials: [Partials.Channel],
});

client.once('ready', (c) => {
  console.log('[bot] connecté en tant que', c.user.tag);
});

// … ici tes handlers de commandes / interactions existants …
// exemple très court pour /play qui utilise resolveTrack + GuildPlayer
client.on('interactionCreate', async (i) => {
  if (!i.isChatInputCommand()) return;
  if (i.commandName !== 'play') return;

  const query = i.options.getString('query', true);

  try {
    await i.deferReply();
    const track = await resolveTrack(query, i.user); // <- doit fournir {title, stream}
    const gp = getOrCreateGuildPlayer(i.guild, i.channel);
    if (!gp.connection) {
      const vc = i.member.voice.channel;
      if (!vc) return i.editReply('Rejoins un salon vocal d’abord.');
      gp.connect(vc);
    }
    gp.enqueue(track);
    if (gp.player.state.status === 'idle') {
      await gp.playNext();
    }
    await i.editReply(`▶️ Je joue: **${track.title}**`);
  } catch (err) {
    console.error('play error:', err);
    await i.editReply('❌ Oups, erreur pendant /play.');
  }
});

client.login(process.env.DISCORD_TOKEN);
