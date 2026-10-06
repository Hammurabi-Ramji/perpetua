// Ways to run the webhook worker locally for the dry-run.
//   in-process : the real src/index.ts handler behind a tiny Node http adapter
//                (fast, hermetic, no workerd needed). Default.
//   wrangler   : `wrangler dev` (real workerd runtime). DRYRUN_WORKER=wrangler.
import http from "node:http";
import { spawn } from "node:child_process";
import { mkdtempSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { AddressInfo } from "node:net";
import worker, { type Env } from "../src/index.ts";

export interface WorkerHost {
  url: string;
  /** console.log/warn lines the worker emitted (in-process only; empty for wrangler). */
  logs: string[];
  close(): Promise<void>;
}

export async function startInProcessWorker(env: Env): Promise<WorkerHost> {
  const logs: string[] = [];
  const origLog = console.log;
  const origWarn = console.warn;
  console.log = (...a: unknown[]) => void logs.push(a.map(String).join(" "));
  console.warn = (...a: unknown[]) => void logs.push(a.map(String).join(" "));

  const server = http.createServer(async (req, res) => {
    const chunks: Buffer[] = [];
    for await (const c of req) chunks.push(c as Buffer);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const request = new Request(`http://worker.local${req.url}`, {
      method: req.method,
      headers: req.headers as Record<string, string>,
      body: req.method === "GET" || req.method === "OPTIONS" ? undefined : body,
    });
    const response = await worker.fetch(request, env);
    res.writeHead(response.status, Object.fromEntries(response.headers));
    res.end(Buffer.from(await response.arrayBuffer()));
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  const { port } = server.address() as AddressInfo;
  return {
    url: `http://127.0.0.1:${port}`,
    logs,
    close: () =>
      new Promise((r) => {
        console.log = origLog;
        console.warn = origWarn;
        server.close(() => r());
      }),
  };
}

export async function startWranglerWorker(env: Env, port: number): Promise<WorkerHost> {
  const root = join(dirname(fileURLToPath(import.meta.url)), "..");
  // Secrets go through a temp env file (not argv) and are deleted afterwards.
  const dir = mkdtempSync(join(tmpdir(), "polar-wh-dev-"));
  const envFile = join(dir, "dryrun.env");
  writeFileSync(
    envFile,
    Object.entries(env)
      .filter(([, v]) => v !== undefined)
      .map(([k, v]) => `${k}=${v}`)
      .join("\n"),
  );
  // One command string (all values are ours, no user input) so `shell: true`
  // works on Windows (npx.cmd) without Node's DEP0190 argument-concatenation warning.
  const proc = spawn(
    `npx wrangler dev --port ${port} --ip 127.0.0.1 --env-file "${envFile}" --show-interactive-dev-session=false`,
    { cwd: root, stdio: "ignore", shell: true },
  );
  const url = `http://127.0.0.1:${port}`;
  for (let i = 0; i < 300; i++) {
    try {
      // Any response (even 405) means the worker is up.
      await fetch(url, { method: "GET" });
      break;
    } catch {
      await new Promise((r) => setTimeout(r, 200));
      if (i === 299) throw new Error("wrangler dev did not start");
    }
  }
  return {
    url,
    logs: [],
    close: async () => {
      if (process.platform === "win32" && proc.pid) {
        spawn("taskkill", ["/pid", String(proc.pid), "/T", "/F"], { stdio: "ignore" });
      } else {
        proc.kill();
      }
      await new Promise((r) => setTimeout(r, 500));
      rmSync(dir, { recursive: true, force: true });
    },
  };
}
