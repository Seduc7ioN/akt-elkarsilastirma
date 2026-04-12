import { spawn } from "node:child_process";

const child = spawn(process.platform === "win32" ? "python" : "python3", ["-m", "http.server", "4173", "-d", "dist"], {
  stdio: "inherit",
  shell: false,
});

child.on("exit", (code) => process.exit(code ?? 0));
