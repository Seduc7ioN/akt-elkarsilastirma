// PNG → MP4 (Instagram Reels spec): 1080x1920, H.264, AAC, 7 saniye, hafif zoom.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
const exec = promisify(execFile);

export async function composeMp4(inputPng, outMp4, { durationSec = 7, fps = 30 } = {}) {
  // ffmpeg: loop tek kareyi, hafif zoompan, AAC sessiz ses (IG ses ister).
  const args = [
    "-y",
    "-loop", "1",
    "-i", inputPng,
    "-f", "lavfi",
    "-i", "anullsrc=channel_layout=stereo:sample_rate=44100",
    "-t", String(durationSec),
    "-vf", `zoompan=z='min(zoom+0.0008,1.06)':d=${durationSec * fps}:s=1080x1920:fps=${fps},format=yuv420p`,
    "-c:v", "libx264",
    "-profile:v", "main",
    "-pix_fmt", "yuv420p",
    "-preset", "medium",
    "-crf", "22",
    "-movflags", "+faststart",
    "-c:a", "aac",
    "-b:a", "128k",
    "-shortest",
    outMp4,
  ];
  await exec("ffmpeg", args, { maxBuffer: 32 * 1024 * 1024 });
  return outMp4;
}
