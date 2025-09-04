import "dotenv/config";
import express from "express";
import {
  Client,
  GatewayIntentBits,
  Partials,
  Collection,
  REST,
  Routes,
  EmbedBuilder
} from "discord.js";
import { ensureFfmpeg } from "./util/ffmpeg.js";
import { logToDiscord } from "./util/logger.js";
import { getOrCreateGuildPlayer } from "./core/player.js";
import { resolveTrack } from "./util/resolveTrack.js";
import play from "play-dl";

// --- FFmpeg
await ensureFfmpeg();

// --- play-dl (YouTube cookie + identity token)
const YT_COOKIE = process.env.YT_COOKIE?.trim();
const YT_ID = process.env.YT_CLIENT_ID?.trim(); // x-youtube-identity-token
if (YT_COOKIE) {
  play.setToken({
    youtube: {
      cookie: YT_COOKIE,
      identityToken: YT_ID || undefined
    }
  });
  console.log("[yt] play-dl: cookie + identity token configurés");
} else {
  console.warn("[yt] ATTENTION: pas de YT_COOKIE dans l'env");
}

// --- Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates
  ],
  partials: [Partials.Channel]
});

// états par serveur: Map<guildId, { queue: Queue }>
const states = new Collection();

// prêt
client.once("ready", async () => {
  console.log(`[bot] connecté en tant que ${client.user.tag}`);
  await logToDiscord(client, "INFO", `[bot] connecté en tant que ${client.user.tag}`);
});

// interaction slash: /play <query>
client.on("interactionCreate", async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName !== "play") return;

  const query = interaction.options.getString("query", true);
  const member = await interaction.guild.members.fetch(interaction.user.id);
  const voice = member?.voice?.channel;

  if (!voice) {
    return interaction.reply({ content: "❌ Tu dois être en vocal.", ephemeral: true });
  }

  // état du guild
  if (!states.has(interaction.guildId)) {
    states.set(interaction.guildId, { queue: null });
  }
  const state = states.get(interaction.guildId);

  try {
    await interaction.deferReply({ ephemeral: false });

    const track = await resolveTrack(query);
    track.requestedBy = interaction.user.username;

    // queue
    if (!state.queue) {
      const { Queue } = await import("./core/queue.js");
      state.queue = new Queue();
    }

    // player
    const gp = getOrCreateGuildPlayer(interaction.guild, interaction.channel, client);
    gp.setQueue(state.queue);
    await gp.connect(voice);
    await gp.playOrEnqueue(track);

    const emb = new EmbedBuilder()
      .setColor(0x00b894)
      .setDescription(`▶️ **Je joue**: ${track.title}`);

    await interaction.editReply({ embeds: [emb] });
  } catch (err) {
    await logToDiscord(client, "ERROR", "Erreur pendant la résolution/lecture", err);
    const msg = (err?.message || String(err)).slice(0, 1800);
    await interaction.editReply(`Oups, erreur : ${msg}`);
  }
});

// mini HTTP (keepalive)
const app = express();
app.get("/", (_, res) => res.send("ok"));
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`[web] listening on ${PORT}`));

// login
client.login(process.env.DISCORD_TOKEN);
