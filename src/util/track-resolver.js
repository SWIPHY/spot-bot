import play from "play-dl";
import { logToDiscord } from "./logger.js";

// Petite aide pour reconnaître une URL YouTube
const YT_REGEX =
  /^(https?:\/\/)?(www\.)?(youtube\.com|youtu\.be)\//i;

export async function resolveTrack(query) {
  try {
    // URL YouTube directe
    if (YT_REGEX.test(query)) {
      const info = await play.video_basic_info(query);
      const v = info?.video_details;
      if (!v?.url) return null;
      return {
        title: v.title || "Titre inconnu",
        url: v.url,
        duration: v.durationInSec || 0,
      };
    }

    // Recherche mots-clés
    const res = await play.search(query, {
      limit: 1,
      source: { youtube: "video" },
    });
    if (!res.length) return null;
    const it = res[0];
    return {
      title: it.title,
      url: it.url,
      duration: it.durationInSec || 0,
    };
  } catch (e) {
    logToDiscord(`❌ resolveTrack: ${e?.message || e}`);
    throw e;
  }
}
