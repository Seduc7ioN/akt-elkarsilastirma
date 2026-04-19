// MP4'i FTP ile siteye yukler, public URL doner.
// curl ile yapiyoruz — ubuntu runner'da curl FTP destekliyor, ek dependency yok.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import path from "node:path";
const exec = promisify(execFile);

export async function uploadToFtp(localFile, remoteSubdir = "reels") {
  const host = process.env.FTP_HOST;
  const user = process.env.FTP_USER;
  const pass = process.env.FTP_PASSWORD;
  const root = (process.env.FTP_REMOTE_DIR || "/").replace(/\/+$/, "");
  const siteUrl = (process.env.SITE_URL || "https://xn--aktelkarsilastirma-o6b.com").replace(/\/$/, "");
  if (!host || !user || !pass) throw new Error("FTP env eksik (FTP_HOST/USER/PASSWORD).");

  const name = path.basename(localFile);
  const remotePath = `${root}/${remoteSubdir}/${name}`;
  const ftpUrl = `ftp://${host}${remotePath}`;

  // --ftp-create-dirs yoksa subdir eksik olabilir
  await exec("curl", [
    "--silent", "--show-error",
    "-u", `${user}:${pass}`,
    "--ftp-create-dirs",
    "-T", localFile,
    ftpUrl,
  ], { maxBuffer: 8 * 1024 * 1024 });

  return `${siteUrl}/${remoteSubdir}/${name}`;
}
