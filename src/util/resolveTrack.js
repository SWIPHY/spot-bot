import play from "play-dl";

export async function resolveTrack(query) {
  try {
    // Vérifie si c'est une URL
    const isUrl = /^https?:\/\//.test(query);
    if (isUrl) {
      const info = await play.video_basic_info(query).catch(() => null);
      if (!info) return null;
      return {
        title: info.video_details?.title || "Unknown",
        url: info.video_details?.url || query
      };
    }

    // Sinon → recherche YouTube
    const results = await play.search(query, { limit: 1, source: { youtube: "video" } }).catch(() => []);
    if (!results || results.length === 0) return null;

    const video = results[0];
    return {
      title: video.title || "Unknown",
      url: video.url // ⚡ ICI on renvoie bien une URL valide
    };
  } catch (err) {
    console.error("[resolveTrack] error:", err);
    return null;
  }
}
