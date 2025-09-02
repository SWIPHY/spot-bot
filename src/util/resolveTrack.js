import play from "play-dl";
import { logToDiscord } from "./logger.js";

/**
 * Résout une requête : URL YouTube ou mots-clés.
 * Retourne { title, url }.
 */
export async function resolveTrack(query) {
  try {
    const isUrl = /^https?:\/\/\S+$/i.test(query);

    if (isUrl) {
      const info = await play.video_basic_info(query);
      return {
        title: info?.video_details?.title || "Unknown",
        url: info?.video_details?.url || query
      };
    }

    // recherche YouTube (1er résultat vidéo)
    const res = await play.search(query, { limit: 1, source: { youtube: "video" } });
    if (!res?.length) throw new Error("Aucun résultat YouTube");
    const first = res[0];
    return { title: first.title || "Unknown", url: first.url };
  } catch (err) {
    await logToDiscord("resolveTrack error", err?.stack || String(err), { level: "error" });
    throw err;
  }
}

// export par défaut pour compat ES import default
export default resolveTrack;
