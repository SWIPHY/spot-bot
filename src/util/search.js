import play from "play-dl";
import { logToDiscord } from "./logger.js";

export async function resolveTrack(query) {
  try {
    if (play.yt_validate(query) === "video") {
      const info = await play.video_info(query);
      return {
        title: info.video_details.title,
        url: info.video_details.url,
        duration: info.video_details.durationInSec,
      };
    }
    const results = await play.search(query, { limit: 1, source: { youtube: "video" } });
    if (!results.length) return null;
    const v = results[0];
    logToDiscord(`🔎 Résolu: ${v.title}`);
    return { title: v.title, url: v.url, duration: v.durationInSec };
  } catch (e) {
    console.error("resolveTrack error:", e);
    logToDiscord(`❌ resolveTrack: ${e?.message || e}`);
    return null;
  }
}
