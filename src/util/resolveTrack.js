import play from "play-dl";

/**
 * Résout un titre ou une URL en track { title, url }.
 * @param {string} query
 * @returns {Promise<{title:string,url:string}|null>}
 */
export async function resolveTrack(query) {
  try {
    // Si c'est une URL valide -> on prend direct
    try {
      const url = new URL(query);
      const info = await play.video_info(url.href);
      return {
        title: info.video_details.title,
        url: info.video_details.url,
      };
    } catch {
      // sinon on tente recherche
      const results = await play.search(query, {
        limit: 1,
        source: { youtube: "video" },
      });
      if (results.length > 0) {
        return {
          title: results[0].title,
          url: results[0].url,
        };
      }
    }
    return null;
  } catch (e) {
    console.error("resolveTrack error:", e);
    return null;
  }
}
