import play from "play-dl";
import { logToDiscord } from "./logger.js";

export async function resolveTrack(query) {
  try {
    const isUrl = /^https?:\/\/\S+/i.test(query);
    if (isUrl) {
      const info = await play.video_basic_info(query).catch(() => null);
      if (!info) throw new Error("video_basic_info a échoué");
      return { title: info.video_details?.title || "Unknown", url: info.video_details?.url || query };
    }

    const res = await play.search(query, { limit: 1, source: { youtube: "video" } }).catch(() => []);
    if (!res?.length) throw new Error("Aucun résultat YouTube");

    const first = res[0];
    return { title: first?.title || "Unknown", url: first?.url };
  } catch (err) {
    await logToDiscord("resolveTrack error", `${query}\n${err?.stack || err?.message}`, { level: "error" });
    throw err;
  }
}
