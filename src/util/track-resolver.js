import play from "play-dl";

export async function resolveTrack(query) {
  try {
    // Si c’est une URL
    if (query.startsWith("http")) {
      const info = await play.video_info(query);
      return {
        title: info.video_details.title,
        url: info.video_details.url,
      };
    }

    // Sinon, recherche
    const results = await play.search(query, { limit: 1, source: { youtube: "video" } });
    if (!results.length) return null;

    return {
      title: results[0].title,
      url: results[0].url,
    };
  } catch (e) {
    console.error("resolveTrack error:", e.message);
    return null;
  }
}
