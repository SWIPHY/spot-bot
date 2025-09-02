import "dotenv/config";
import express from "express";
import { Client, GatewayIntentBits, Partials } from "discord.js";
import { ensureFfmpeg } from "./util/ffmpeg.js";
import { initLogger, logToDiscord } from "./util/logger.js";
import resolveTrack from "./util/resolveTrack.js";
import getOrCreateGuildPlayer from "./core/player.js";
import play from "play-dl";

// --------- Boot ----------
await ensureFfmpeg();

// Cookies / Identity token pour play-dl (YouTube)
const YT_COOKIE = (process.env.YT_COOKIE || "").trim();
const YT_ID = (process.env.YT_CLIENT_ID || "").trim();
if (YT_COOKIE) {
  play.setToken({
    youtube: {
      cookie: YT_COOKIE,
      identityToken: YT_ID || undefined,
    },
  });
  console.log("[yt] play-dl: cookie + identity token configurés");
}

// HTTP keepalive (Railway)
const app = express();
app.get("/", (_, res) => res.send("ok"));
const PORT = Number(process.env.PORT || 8080);
app.listen(PORT, () => console.log(`[web] listening on ${PORT}`));

// Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages
  ],
  partials: [Partials.Channel]
});

initLogger(client, process.env.LOG_CHANNEL_ID);

// ready
client.once("ready", async () => {
  await logToDiscord("bot", `connecté en tant que ${client.user.tag}`, { level: "info" });
});

// slash interactions (play/stop minimalistes)
// Adapte si tu as déjà ton système de commandes.
client.on("interactionCreate", async (i) => {
  try {
    if (!i.isChatInputCommand()) return;

    if (i.commandName === "play") {
      const query = i.options.getString("query", true);
      await i.deferReply({ ephemeral: false });

      const track = await resolveTrack(query);           // {title,url}
      const member = await i.guild.members.fetch(i.user.id);
      const vc = member.voice.channel;
      if (!vc) return i.editReply("Rejoins un salon vocal d’abord.");

      const gp = getOrCreateGuildPlayer(i.guild, i.channel);
      gp.connect(vc);
      await gp.addAndPlay(track);

      return i.editReply(`▶️ **${track.title}**`);
    }

    if (i.commandName === "stop") {
      const gp = getOrCreateGuildPlayer(i.guild, i.channel);
      gp.stop();
      return i.reply({ content: "⏹️ Stop.", ephemeral: false });
    }
  } catch (err) {
    await logToDiscord("Unhandled interaction", err?.stack || String(err), { level: "error" });
    if (i.isRepliable()) {
      try { await i.reply({ content: "❌ Erreur.", ephemeral: true }); } catch {}
    }
  }
});

// garde-fous
process.on("unhandledRejection", (r) =>
  logToDiscord("UnhandledRejection", String(r?.stack || r), { level: "error" })
);
process.on("uncaughtException", (e) =>
  logToDiscord("UncaughtException", String(e?.stack || e), { level: "error" })
);

client.login(process.env.DISCORD_TOKEN);
