import ffmpegStatic from "ffmpeg-static";
import { access } from "node:fs/promises";
import { constants } from "node:fs";

/** Teste si un binaire est exécutable */
async function isExecutable(p) {
  try { if (!p) return false; await access(p, constants.X_OK); return true; }
  catch { return false; }
}

/** Choisit un binaire ffmpeg et fixe process.env.FFMPEG_PATH */
export async function ensureFfmpeg() {
  // 1) si déjà défini et exécutable (ex: Aptfile sur Railway)
  if (await isExecutable(process.env.FFMPEG_PATH)) {
    console.log(`[ffmpeg] using FFMPEG_PATH at ${process.env.FFMPEG_PATH}`);
    return process.env.FFMPEG_PATH;
  }
  // 2) sinon, utilise ffmpeg-static
  if (await isExecutable(ffmpegStatic)) {
    process.env.FFMPEG_PATH = ffmpegStatic;
    console.log(`[ffmpeg] using ffmpeg-static at ${ffmpegStatic}`);
    return process.env.FFMPEG_PATH;
  }
  // 3) dernier recours : commande "ffmpeg" dans le PATH
  process.env.FFMPEG_PATH = "ffmpeg";
  console.warn("[ffmpeg] static introuvable, on tente 'ffmpeg' via PATH");
  return process.env.FFMPEG_PATH;
}

/** Commande à utiliser si tu dois faire un spawn manuel */
export function ffmpegCmd() {
  return process.env.FFMPEG_PATH || "ffmpeg";
}
