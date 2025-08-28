import play from 'play-dl';

export async function resolveTrack(query) {
  // URL ?
  const isUrl = /^https?:\/\//i.test(query);
  if (isUrl) {
    const info = await play.video_basic_info(query).catch(() => null);
    if (!info) return null;
    return { title: info.video_details?.title || 'Unknown', url: info.video_details?.url || query };
  }

  // recherche YouTube
  const res = await play.search(query, { limit: 1, source: { youtube: 'video' } }).catch(() => []);
  if (!res?.length) return null;
  const first = res[0];
  return { title: first.title || 'Unknown', url: first.url };
}
