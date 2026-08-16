import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

// Ciclo de vida do backend temporario usado pelo runner E2E.
// Sempre com node direto (sem shell/npm) para que o kill atinja o processo real.

export function startBackendProcess({ backendDir, env = {}, onOutput } = {}) {
  const child = spawn(process.execPath, ["src/server.js"], {
    cwd: backendDir,
    env: { ...process.env, ...env },
    stdio: ["ignore", "pipe", "pipe"],
    shell: false,
    windowsHide: true,
  });

  const output = [];
  const capture = (chunk) => {
    const text = chunk.toString();
    output.push(text);
    if (output.length > 200) output.shift();
    if (onOutput) onOutput(text);
  };

  child.stdout?.on("data", capture);
  child.stderr?.on("data", capture);

  let exited = false;
  let exitInfo = null;
  child.on("exit", (code, signal) => {
    exited = true;
    exitInfo = { code, signal };
  });
  child.on("error", (error) => {
    exited = true;
    exitInfo = { code: null, signal: null, message: error.message };
  });

  return {
    child,
    isAlive: () => !exited,
    getExitInfo: () => exitInfo,
    getOutput: () => output.join(""),
  };
}

export async function waitForHealth(healthUrl, options = {}) {
  const timeoutMs = options.timeoutMs ?? 30000;
  const intervalMs = options.intervalMs ?? 500;
  const isAlive = options.isAlive;
  const deadline = Date.now() + timeoutMs;
  let lastError = "no response";

  while (Date.now() < deadline) {
    if (isAlive && !isAlive()) {
      throw new Error(`backend process exited before answering ${healthUrl}`);
    }

    try {
      const response = await fetch(healthUrl, { signal: AbortSignal.timeout(2500) });
      if (response.ok) return await response.json();
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error.message;
    }

    await delay(intervalMs);
  }

  throw new Error(`health check timed out after ${timeoutMs}ms (${lastError})`);
}

export async function stopBackendProcess(handle, options = {}) {
  if (!handle) return;
  const graceMs = options.graceMs ?? 5000;
  const { child } = handle;
  if (!child || child.exitCode !== null || !handle.isAlive()) return;

  const exited = new Promise((resolve) => {
    child.once("exit", resolve);
  });

  child.kill("SIGTERM");

  const timer = delay(graceMs).then(() => "timeout");
  const result = await Promise.race([exited.then(() => "exited"), timer]);

  if (result === "timeout" && handle.isAlive()) {
    child.kill("SIGKILL");
    await Promise.race([exited, delay(2000)]);
  }
}
