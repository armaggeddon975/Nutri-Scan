import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const scriptsDir = path.dirname(fileURLToPath(import.meta.url));

export const rootDir = path.resolve(scriptsDir, "..");
export const backendDir = path.join(rootDir, "backend");
export const isWindows = process.platform === "win32";

export function maskConfigured(value) {
  return value ? "configured" : "not_configured";
}

export function statusLine(status, label, detail = "") {
  const suffix = detail ? ` - ${detail}` : "";
  return `[${status}] ${label}${suffix}`;
}

export function checkPathExists(targetPath) {
  return existsSync(path.resolve(rootDir, targetPath));
}

export function runCommand(command, args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(command, args, {
      cwd: options.cwd || rootDir,
      env: { ...process.env, ...(options.env || {}) },
      shell: false,
      windowsHide: true,
    });

    let stdout = "";
    let stderr = "";

    child.stdout?.on("data", (chunk) => {
      stdout += chunk.toString();
      if (options.inherit) process.stdout.write(chunk);
    });
    child.stderr?.on("data", (chunk) => {
      stderr += chunk.toString();
      if (options.inherit) process.stderr.write(chunk);
    });

    child.on("error", (error) => {
      resolve({ code: 1, stdout, stderr: `${stderr}${error.message}` });
    });
    child.on("close", (code) => {
      resolve({ code: code ?? 1, stdout, stderr });
    });
  });
}

export function npmCommand(args, options = {}) {
  if (isWindows) {
    return runCommand("cmd.exe", ["/c", "npm.cmd", ...args], options);
  }
  return runCommand("npm", args, options);
}

export async function commandExists(command, args = ["--version"]) {
  const result = await runCommand(command, args);
  return result.code === 0;
}
