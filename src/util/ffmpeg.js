import ffmpegStatic from "ffmpeg-static";
import { access } from "node:fs/promises";
import { constants } from "node:fs";

/** Test si un binaire est exécutable */
async function isExecutable(p) {
  try {
    if (!p) return false;
    await access(p, constants.X_OK);
    return true;
  } catch {
    return false;
  }
}

/** Choisit un binaire ffmpeg et fixe process.env.FFMPEG_PATH */
export async function ensureFfmpeg() {
  // 1) si déjà défini côté plateforme (Aptfile/variable)
  if (await isExecutable(process.env.FFMPEG_PATH)) {
    console.log(`[ffmpeg] using FFMPEG_PATH -> ${process.env.FFMPEG_PATH}`);
    return process.env.FFMPEG_PATH;
  }

  // 2) sinon, utilise ffmpeg-static
  if (await isExecutable(ffmpegStatic)) {
    process.env.FFMPEG_PATH = ffmpegStatic;
    console.log(`[ffmpeg] using ffmpeg-static at ${ffmpegStatic}`);
    return process.env.FFMPEG_PATH;
  }

  // 3) fallback: nom de commande (si présent dans PATH)
  process.env.FFMPEG_PATH = "ffmpeg";
  console.warn("[ffmpeg] static introuvable, tentative via 'ffmpeg' dans le PATH");
  return process.env.FFMPEG_PATH;
}

/** Commande à utiliser pour spawn si besoin */
export function ffmpegCmd() {
  return process.env.FFMPEG_PATH || "ffmpeg";
}
