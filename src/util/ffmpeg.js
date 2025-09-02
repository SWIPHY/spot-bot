// Choisit un binaire ffmpeg et fixe process.env.FFMPEG_PATH pour tout le process
import ffmpegStatic from 'ffmpeg-static';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';

async function isExecutable(p) {
  try {
    if (!p) return false;
    await access(p, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/**
 * Tente dans cet ordre :
 * 1) Respecter une valeur déjà fournie (ex: Aptfile -> /usr/bin/ffmpeg)
 * 2) Utiliser le binaire de npm (ffmpeg-static)
 * 3) Laisser “ffmpeg” du PATH (si installé dans l’image)
 */
export async function ensureFfmpeg() {
  // 1) valeur déjà définie
  if (await isExecutable(process.env.FFMPEG_PATH)) {
    console.log(`[ffmpeg] using FFMPEG_PATH=${process.env.FFMPEG_PATH}`);
    return process.env.FFMPEG_PATH;
  }

  // 2) binaire embarqué
  if (await isExecutable(ffmpegStatic)) {
    process.env.FFMPEG_PATH = ffmpegStatic;
    console.log(`[ffmpeg] using ffmpeg-static at ${ffmpegStatic}`);
    return process.env.FFMPEG_PATH;
  }

  // 3) fallback PATH
  process.env.FFMPEG_PATH = 'ffmpeg';
  console.warn(`[ffmpeg] static introuvable, tentative via "ffmpeg" du PATH`);
  return process.env.FFMPEG_PATH;
}

/** Renvoie la commande à utiliser si besoin ponctuel (spawn, etc.) */
export function ffmpegCmd() {
  return process.env.FFMPEG_PATH || 'ffmpeg';
}
