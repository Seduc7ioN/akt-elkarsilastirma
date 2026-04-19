// PNG → MP4 (Instagram Reels spec): 1080x1920, H.264, AAC, 7 saniye, hafif zoom.
// Opsiyonel arka plan müziği: scripts/social/reels/assets/music/*.mp3 içine
// ücretsiz/CC0 müzik dosyaları bırakılırsa rastgele seçilir. Yoksa sessiz.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const exec = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MUSIC_DIR = path.join(__dirname, "..", "assets", "music");

async function pickMusic() {
  // Env override: REELS_MUSIC_URL veya REELS_MUSIC_FILE
  if (process.env.REELS_MUSIC_FILE) return process.env.REELS_MUSIC_FILE;
  try {
    const files = (await readdir(MUSIC_DIR))
      .filter((f) => /\.(mp3|m4a|aac|wav|ogg)$/i.test(f));
    if (!files.length) return null;
    const pick = files[Math.floor(Math.random() * files.length)];
    return path.join(MUSIC_DIR, pick);
  } catch {
    return null;
  }
}

export async function composeMp4(inputPng, outMp4, { durationSec = 7, fps = 30 } = {}) {
  const music = await pickMusic();
  const args = [
    "-y",
    "-loop", "1",
    "-i", inputPng,
  ];

  if (music) {
    args.push("-stream_loop", "-1", "-i", music);
  } else {
    args.push("-f", "lavfi", "-i", "anullsrc=channel_layout=stereo:sample_rate=44100");
  }

  args.push(
    "-t", String(durationSec),
    "-vf", `zoompan=z='min(zoom+0.0008,1.06)':d=${durationSec * fps}:s=1080x1920:fps=${fps},format=yuv420p`,
    "-c:v", "libx264",
    "-profile:v", "main",
    "-pix_fmt", "yuv420p",
    "-preset", "medium",
    "-crf", "22",
    "-movflags", "+faststart",
  );

  if (music) {
    // Müzik: -14dB normalize + 0.4s fade-in + 0.6s fade-out
    const fadeOut = Math.max(0, durationSec - 0.6);
    args.push(
      "-af", `volume=-8dB,afade=t=in:st=0:d=0.4,afade=t=out:st=${fadeOut}:d=0.6`,
      "-c:a", "aac",
      "-b:a", "160k",
      "-ar", "44100",
      "-ac", "2",
    );
    if (music) console.log(`  ♪ muzik: ${path.basename(music)}`);
  } else {
    args.push(
      "-c:a", "aac",
      "-b:a", "128k",
    );
  }

  args.push("-shortest", outMp4);

  await exec("ffmpeg", args, { maxBuffer: 32 * 1024 * 1024 });
  return outMp4;
}
