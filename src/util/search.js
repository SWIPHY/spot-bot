import ytdl from "ytdl-core";
import play from "play-dl";

// Détecte rapidement si c'est une URL
const isUrl = (s) => /^https?:\/\//i.test(s);

// Headers YouTube si cookie fourni (évite le "confirm you're not a bot")
function ytHeaders() {
  const h = {};
  if (process.env.YT_COOKIE && process.env.YT_COOKIE.trim()) {
    h.cookie = process.env.YT_COOKIE.trim();
    h["user-agent"] =
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36";
    h["accept-language"] = "fr-FR,fr;q=0.9,en;q=0.8";
  }
  return h;
}

// Essaie de récupérer un titre propre avec ytdl (supporte headers/cookies)
async function titleFromUrl(url) {
  try {
    const info = await ytdl.getBasicInfo(url, {
      requestOptions: { headers: ytHeaders() },
    });
    return info?.videoDetails?.title || null;
  } catch {
    return null; // au pire on mettra l'URL comme fallback
  }
}

/**
 * Résout une "recherche" en track { title, url } SANS appeler play.video_info
 * (qui déclenche souvent le captcha / consent)
 */
export async function resolveTrack(query) {
  // 1) Si URL -> on renvoie direct, avec un titre best-effort
  if (isUrl(query)) {
    const url = query.trim();
    const title = (await titleFromUrl(url)) || url;
    return { title, url };
  }

  // 2) Sinon recherche YouTube (on utilise play.search juste pour trouver une URL)
  const results = await play.search(query, {
    limit: 1,
    source: { youtube: "video" },
  });

  const first = results?.[0];
  if (!first?.url) {
    const e = new Error("NO_RESULTS");
    e.code = "NO_RESULTS";
    throw e;
  }

  // On évite toute requête d'info ici : on renvoie URL + titre de search
  return { title: first.title || query, url: first.url };
}
