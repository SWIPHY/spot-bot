import play from "play-dl";
import { logToDiscord } from "./logger.js";

/**
 * Résout une requête utilisateur en un objet { title, url } utilisable par play-dl.
 * - Accepte URL YouTube (ou short) **ou** mots-clés.
 * - Garantit toujours une URL valide ou lève une erreur.
 */
export async function resolveTrack(query) {
  try {
    const isUrl = /^https?:\/\/\S+$/i.test(query);

    if (isUrl) {
      // URL directe
      const info = await play.video_basic_info(query).catch(() => null);
      const url = info?.video_details?.url || null;
      const title = info?.video_details?.title || null;
      if (!url) throw new Error("Vidéo introuvable (URL).");
      return { title: title || "Unknown", url };
    }

    // Recherche YouTube
    const res = await play.search(query, {
      limit: 1,
      source: { youtube: "video" },
    }).catch(() => []);

    if (!res || !res.length) throw new Error("Aucun résultat YouTube.");
    const first = res[0];
    if (!first?.url) throw new Error("Résultat invalide.");
    return { title: first.title || "Unknown", url: first.url };
  } catch (err) {
    await logToDiscord("resolveTrack error", err?.stack || String(err), { level: "error" });
    throw err;
  }
}

export default resolveTrack;
