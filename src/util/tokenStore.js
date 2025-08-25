import fs from "node:fs";
import path from "node:path";

const FILE = path.resolve("data/tokens.json");

// charge en mémoire
let cache = {};
try {
  cache = JSON.parse(fs.readFileSync(FILE, "utf8"));
} catch {
  fs.mkdirSync(path.dirname(FILE), { recursive: true });
  fs.writeFileSync(FILE, "{}");
}

// helpers
export function saveUserTokens(userId, tokens) {
  cache[userId] = {
    access_token: tokens.access_token,
    refresh_token: tokens.refresh_token ?? cache[userId]?.refresh_token ?? null,
    expires_at: Date.now() + (tokens.expires_in ? (tokens.expires_in * 1000) : 0),
    scope: tokens.scope || cache[userId]?.scope || "",
  };
  fs.writeFileSync(FILE, JSON.stringify(cache, null, 2));
}

export function getUserTokens(userId) {
  return cache[userId] || null;
}

export function hasUser(userId) {
  return Boolean(cache[userId]);
}
