import { spawn } from "node:child_process";

const isWindows = process.platform === "win32";

const commands = [
  { name: "frontend", args: ["run", "dev"] },
  { name: "backend", args: ["--prefix", "backend", "run", "dev"] },
];

const children = commands.map(({ name, args }) => {
  const command = isWindows ? "cmd.exe" : "npm";
  const commandArgs = isWindows ? ["/c", "npm.cmd", ...args] : args;
  const child = spawn(command, commandArgs, {
    stdio: "inherit",
    env: process.env,
    windowsHide: true,
  });

  child.on("exit", (code, signal) => {
    if (signal) {
      console.log(`[${name}] finalizado por ${signal}`);
      return;
    }

    if (code && code !== 0) {
      console.error(`[${name}] finalizou com erro ${code}`);
      process.exitCode = code;
    }
  });

  return child;
});

function stopAll(signal) {
  for (const child of children) {
    if (!child.killed) child.kill(signal);
  }
}

process.on("SIGINT", () => {
  stopAll("SIGINT");
});

process.on("SIGTERM", () => {
  stopAll("SIGTERM");
});
