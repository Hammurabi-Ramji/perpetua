// Drives a headless `perpetua serve` (the real Perpetua Axum backend) over HTTP.
import { spawn, execFileSync, type ChildProcess } from "node:child_process";
import { mkdtempSync, rmSync, existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

export interface Entitlement {
  pro: boolean;
  free_limit: number;
  used: number;
  remaining: number | null;
  activated_at: string | null;
}

export interface PerpetuaInstance {
  base: string;
  token: string;
  dataDir: string;
  call(method: string, path: string, body?: unknown): Promise<{ status: number; json: any }>;
  addLicense(n: string): Promise<number>;
  entitlement(): Promise<Entitlement>;
  activate(key: string): Promise<{ status: number; json: any }>;
  stop(): Promise<void>;
}

export function resolveBinary(): string {
  const bin = process.env.PERPETUA_BIN;
  if (!bin || !existsSync(bin)) {
    throw new Error(
      "PERPETUA_BIN must point at a perpetua binary built with POLAR_ORGANIZATION_ID and " +
        "POLAR_API_BASE baked in. Build one with desktop/scripts/build-polar-dryrun-binary.ps1 " +
        "(see polar-webhook/dryrun/README.md).",
    );
  }
  return bin;
}

/** `perpetua config` -> the baked-in organization id, or null if Polar is disabled. */
export function bakedOrganizationId(bin: string): string | null {
  const out = execFileSync(bin, ["config"], { encoding: "utf8" });
  const m = out.match(/ENABLED \(organization_id=([^)]+)\)/);
  return m ? m[1] : null;
}

async function waitForHealth(base: string, proc: ChildProcess) {
  for (let i = 0; i < 100; i++) {
    if (proc.exitCode !== null) throw new Error(`perpetua exited early (code ${proc.exitCode})`);
    try {
      const r = await fetch(`${base}/api/health`);
      if (r.ok) return;
    } catch {
      /* not up yet */
    }
    await new Promise((r) => setTimeout(r, 100));
  }
  throw new Error("perpetua did not become healthy");
}

export async function startPerpetua(bin: string, port: number): Promise<PerpetuaInstance> {
  const dataDir = mkdtempSync(join(tmpdir(), "perpetua-dryrun-"));
  const proc = spawn(bin, ["serve", dataDir], {
    env: { ...process.env, PERPETUA_API_PORT: String(port) },
    stdio: "ignore",
  });
  const base = `http://127.0.0.1:${port}`;
  await waitForHealth(base, proc);

  const call = async (method: string, path: string, body?: unknown, token?: string) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    return { status: res.status, json: await res.json().catch(() => null) };
  };

  // Throwaway test account; the password is random and never printed.
  const password = `pw-${crypto.randomUUID()}`;
  const reg = await call("POST", "/api/auth/register", {
    email: `buyer-${port}@example.test`,
    password,
  });
  if (reg.status !== 201) throw new Error(`register failed: ${reg.status}`);
  const token: string = reg.json.data.token;

  return {
    base,
    token,
    dataDir,
    call: (m, p, b) => call(m, p, b, token),
    addLicense: async (n) =>
      (await call("POST", "/api/licenses", { product_name: `Deal ${n}`, license_key: `KEY-${n}` }, token)).status,
    entitlement: async () => (await call("GET", "/api/entitlement", undefined, token)).json.data,
    activate: (key) => call("POST", "/api/activate", { key }, token),
    stop: async () => {
      proc.kill();
      await new Promise((r) => setTimeout(r, 200));
      try {
        rmSync(dataDir, { recursive: true, force: true });
      } catch {
        /* Windows may still hold the sqlite file briefly; temp dir, harmless */
      }
    },
  };
}
