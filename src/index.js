import "dotenv/config";
import { Client, GatewayIntentBits } from "discord.js";
import play from "play-dl";

// --- Vérif des variables essentielles ---
function checkEnv() {
  const required = ["DISCORD_TOKEN", "YT_COOKIE"];
  let ok = true;

  for (const key of required) {
    if (!process.env[key]) {
      console.error(`❌ [ENV] Variable manquante: ${key}`);
      ok = false;
    }
  }

  if (process.env.YT_COOKIE) {
    console.log(`✅ [ENV] YT_COOKIE chargé (${process.env.YT_COOKIE.length} chars)`);
  }
  if (process.env.YT_ID_TOKEN) {
    console.log(`✅ [ENV] YT_ID_TOKEN trouvé (${process.env.YT_ID_TOKEN.length} chars)`);
  } else {
    console.warn("⚠️ [ENV] Pas de YT_ID_TOKEN (le bot peut avoir des 410/403)");
  }

  if (!ok) {
    throw new Error("Certaines variables d'environnement sont manquantes. Arrêt.");
  }
}

checkEnv();

// --- 1) Init play-dl avec cookies + identity token
async function initPlayDl() {
  const cookie = process.env.YT_COOKIE?.trim();
  const idToken = process.env.YT_ID_TOKEN?.trim();

  if (cookie) {
    await play.setToken({
      youtube: {
        cookie,
        identityToken: idToken || undefined,
      },
    });
    console.log("[play-dl] cookie chargé" + (idToken ? " + identityToken" : ""));
  } else {
    console.warn("[play-dl] Aucun YT_COOKIE fourni (tu risques des 410/403)");
  }
}

// --- 2) Lance le bot
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
});

(async () => {
  await initPlayDl();

  client.once("ready", () => {
    console.log(`✅ Connecté en tant que ${client.user.tag}`);
  });

  // … tes handlers/commands habituels …

  await client.login(process.env.DISCORD_TOKEN);
})();
