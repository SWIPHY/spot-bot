import play from "play-dl";

/**
 * Résout une query -> { title, url, duration }
 * - si query est une URL supportée par play-dl, on prend direct
 * - sinon: recherche YouTube et prend le 1er résultat
 */
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
    // recherche YouTube
    const results = await play.search(query, { limit: 1, source: { youtube: "video" } });
    if (!results.length) return null;
    const v = results[0];
    return { title: v.title, url: v.url, duration: v.durationInSec };
  } catch (e) {
    console.error("resolveTrack error:", e);
    return null;
  }
}
