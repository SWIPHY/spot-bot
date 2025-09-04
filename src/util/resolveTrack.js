import play from "play-dl";

const YT_URL_RE =
  /^https?:\/\/(www\.)?(youtube\.com|youtu\.be)\/.+/i;

export default async function resolveTrack(query) {
  // URL directe ?
  if (YT_URL_RE.test(query)) {
    const info = await play.video_basic_info(query).catch(() => null);
    if (!info) throw new Error("Impossible de récupérer les infos de la vidéo.");
    const title = info.video_details?.title || "Unknown";
    const url = info.video_details?.url || query;
    return { title, url };
  }

  // Recherche par mots-clés
  const res = await play
    .search(query, { limit: 1, source: { youtube: "video" } })
    .catch(() => []);

  if (!res?.length) {
    throw new Error(`Aucun résultat YouTube pour: ${query}`);
  }

  const first = res[0];
  return { title: first.title || "Unknown", url: first.url };
}
