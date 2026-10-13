/**
 * Local "sandbox internet" Hono server that records every request it receives.
 * Used by web-actions-server and e2e tests to prove denied calls never leave.
 */
import { createServer, type Server as HttpServer } from "node:http";
import { Hono } from "hono";

export interface SandboxRequest {
  path: string;
  body: unknown;
  at: string;
}

export async function startSandboxInternet(port = 0): Promise<{
  url: string;
  received: SandboxRequest[];
  stop: () => void;
}> {
  const received: SandboxRequest[] = [];
  const app = new Hono();

  app.post("*", async (c) => {
    const body = await c.req.json().catch(() => ({}));
    received.push({
      path: new URL(c.req.url).pathname,
      body,
      at: new Date().toISOString(),
    });
    return c.json({ ok: true, recorded: true });
  });

  const server: HttpServer = createServer(async (req, res) => {
    const url = new URL(req.url ?? "/", "http://127.0.0.1");
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (typeof v === "string") headers.set(k, v);
      else if (Array.isArray(v)) headers.set(k, v.join(", "));
    }
    const chunks: Buffer[] = [];
    for await (const chunk of req) chunks.push(Buffer.from(chunk));
    const request = new Request(url.toString(), {
      method: req.method,
      headers,
      body: chunks.length ? Buffer.concat(chunks) : undefined,
    });
    const response = await app.fetch(request);
    res.statusCode = response.status;
    response.headers.forEach((value, key) => res.setHeader(key, value));
    res.end(Buffer.from(await response.arrayBuffer()));
  });

  await new Promise<void>((resolve) => {
    server.listen(port, "127.0.0.1", () => resolve());
  });
  const addr = server.address();
  if (!addr || typeof addr === "string") throw new Error("sandbox bind failed");
  return {
    url: `http://127.0.0.1:${addr.port}`,
    received,
    stop: () => server.close(),
  };
}

if (import.meta.main) {
  const s = await startSandboxInternet(Number(process.env.PORT ?? 8799));
  console.log("sandbox internet at", s.url);
}
