import { search } from 'play-dl';


export async function ytSuggest(query) {
if (!query) return [];
const res = await search(query, { source: { youtube: 'video' }, limit: 5 });
return res.map(v => ({
title: v.title?.slice(0, 100) || 'Unknown',
url: v.url,
author: v.channel?.name || 'Unknown',
duration: v.durationRaw || '',
}));
}