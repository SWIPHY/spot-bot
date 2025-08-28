export async function logToDiscord(text) {
  try {
    const { default: pkg } = await import('node:process');
    const client = globalThis.discordClient || null;
    if (!client) {
      console.log('[log]', text);
      return;
    }
    const id = process.env.LOG_CHANNEL_ID;
    if (!id) {
      console.log('[log]', text);
      return;
    }
    const ch = await client.channels.fetch(id).catch(() => null);
    if (!ch) {
      console.log('[log]', text);
      return;
    }
    await ch.send(String(text).slice(0, 1900));
  } catch {
    // ignore
  }
}
