import play from "play-dl";

/**
 * Résout une requête en track(s) :
 * - URL vidéo -> 1 piste
 * - URL playlist -> plusieurs pistes
 * - Mots-clés -> 1 piste (1er résultat)
 *
 * Retour:
 * - { kind: "single", track: { title, url, requestedBy? } }
 * - { kind: "many", tracks: [{ title, url, requestedBy? }], title?: string }
 * - null si rien trouvé
 */
export default async function resolveTrack(query, requestedBy) {
  const isUrl = /^https?:\/\//i.test(query);

  try {
    // --- cas URL ---
    if (isUrl) {
      const kind = await play.validate(query); // 'yt_video' | 'yt_playlist' | false

      if (kind === "yt_playlist") {
        const pl = await play.playlist_info(query, { incomplete: true });
        // on récupère le plus possible (Railway + quotas)
        const vids = await pl.all_videos();
        const tracks = vids.map((v) => ({
          title: v.title || "Unknown",
          url: v.url,
          requestedBy: requestedBy?.username || undefined,
        }));
        if (tracks.length === 0) return null;
        return { kind: "many", tracks, title: pl.title || undefined };
      }

      // vidéo simple (ou URL non validée, on tente quand même)
      try {
        const info = await play.video_info(query);
        const vd = info.video_details;
        return {
          kind: "single",
          track: {
            title: vd.title || "Unknown",
            url: vd.url, // URL canonique -> évite "Invalid URL"
            requestedBy: requestedBy?.username || undefined,
          },
        };
      } catch {
        // dernier recours : stream direct (obtenir l’URL finale)
        const basic = await play.video_basic_info(query);
        const vd = basic?.video_details;
        if (!vd?.url) return null;
        return {
          kind: "single",
          track: {
            title: vd.title || "Unknown",
            url: vd.url,
            requestedBy: requestedBy?.username || undefined,
          },
        };
      }
    }

    // --- cas mots-clés : 1er résultat vidéo YouTube ---
    const res = await play.search(query, {
      limit: 1,
      source: { youtube: "video" },
      // safesearch: 'none'
    });
    if (!res || res.length === 0) return null;

    const first = res[0];
    return {
      kind: "single",
      track: {
        title: first.title || "Unknown",
        url: first.url,
        requestedBy: requestedBy?.username || undefined,
      },
    };
  } catch (err) {
    // on laisse l’appelant logger l’erreur détaillée
    return null;
  }
}
