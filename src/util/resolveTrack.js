import play from 'play-dl';
import ytdl from 'ytdl-core';

/**
 * Résout une requête (URL ou mots-clés) en un track prêt à lire.
 * Retourne { title, url, stream } ou null.
 */
export async function resolveTrack(query) {
  // 1) Déterminer l’URL vidéo + titre (soit URL directe, soit recherche)
  let videoUrl = null;
  let title = 'Unknown';

  const isUrl = /^https?:\/\//i.test(query);
  if (isUrl) {
    const info = await play.video_basic_info(query).catch(() => null);
    if (!info) return null;
    videoUrl = info.video_details?.url ?? query;
    title = info.video_details?.title ?? 'Unknown';
  } else {
    const results = await play
      .search(query, { limit: 1, source: { youtube: 'video' } })
      .catch(() => []);
    if (!results?.length) return null;
    videoUrl = results[0].url;
    title = results[0].title ?? 'Unknown';
  }

  // 2) Essayer d'abord play-dl (plus simple/rapide quand ça passe)
  try {
    const s = await play.stream(videoUrl);
    // s.stream est un Readable; s.type est parfois utile mais on va prob-er côté player
    return { title, url: videoUrl, stream: s.stream };
  } catch (_) {
    // continue: fallback ytdl-core
  }

  // 3) Fallback ytdl-core (audio only)
  try {
    const ytdlStream = ytdl(videoUrl, {
      quality: 'highestaudio',
      filter: 'audioonly',
      highWaterMark: 1 << 25, // buffers généreux
      dlChunkSize: 0,         // streaming continu
    });
    return { title, url: videoUrl, stream: ytdlStream };
  } catch (err) {
    // Rien ne marche
    return null;
  }
}
