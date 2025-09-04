import ffmpegStatic from "ffmpeg-static";
import { access } from "node:fs/promises";
import { constants } from "node:fs";

async function isExecutable(p) {
  try { if (!p) return false; await access(p, constants.X_OK); return true; }
  catch { return false; }
}

/** Choisit un binaire ffmpeg et fixe process.env.FFMPEG_PATH */
export async function ensureFfmpeg() {
  if (await isExecutable(process.env.FFMPEG_PATH)) {
    console.log(`[ffmpeg] using FFMPEG_PATH=${process.env.FFMPEG_PATH}`);
    return process.env.FFMPEG_PATH;
  }
  if (await isExecutable(ffmpegStatic)) {
    process.env.FFMPEG_PATH = ffmpegStatic;
    console.log(`[ffmpeg] using ffmpeg-static at ${ffmpegStatic}`);
    return process.env.FFMPEG_PATH;
  }
  // dernier recours: faire confiance au PATH
  process.env.FFMPEG_PATH = "ffmpeg";
  console.warn("[ffmpeg] static introuvable, tentative via 'ffmpeg' dans le PATH");
  return process.env.FFMPEG_PATH;
}

/** Renvoie la commande ffmpeg à utiliser (spawn) */
export function ffmpegCmd() {
  return process.env.FFMPEG_PATH || "ffmpeg";
}
