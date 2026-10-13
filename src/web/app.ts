import { createServer, type Server as HttpServer } from "node:http";
import { randomBytes } from "node:crypto";
import { Hono } from "hono";
import type { Ledger } from "../ledger/db.ts";
import type { Brake } from "../brake.ts";
import type { ApprovalBroker } from "../policy/approvals.ts";

export interface WebDeps {
  host: "127.0.0.1";
  port: number;
  ledger: Ledger;
  brake: Brake;
  approvals: ApprovalBroker;
  agentLabel: string;
  sessionId: string;
}

export async function startWeb(deps: WebDeps): Promise<{
  url: string;
  token: string;
  stop: () => void;
}> {
  const token = randomBytes(24).toString("hex");
  const app = new Hono();

  app.use("*", async (c, next) => {
    const auth = c.req.header("authorization") ?? "";
    const q = c.req.query("token");
    if (auth !== `Bearer ${token}` && q !== token) {
      return c.json({ error: "unauthorized" }, 401);
    }
    await next();
  });

  app.get("/api/events", (c) => {
    return c.json(deps.ledger.list());
  });

  app.get("/api/status", (c) => {
    return c.json({
      brake: deps.brake.isActive(),
      chain: deps.ledger.verify(),
      sessionId: deps.sessionId,
      pending: deps.approvals.listPending().map((p) => ({
        id: p.id,
        server: p.server,
        tool: p.tool,
        createdAt: p.createdAt,
      })),
    });
  });

  app.post("/api/brake", async (c) => {
    deps.brake.engage(deps.sessionId, deps.agentLabel);
    return c.json({ ok: true });
  });

  app.post("/api/release", async (c) => {
    const body = (await c.req.json().catch(() => ({}))) as { reason?: string };
    deps.brake.release(
      deps.sessionId,
      deps.agentLabel,
      body.reason ?? "web-ui",
    );
    return c.json({ ok: true });
  });

  app.post("/api/approvals/:id/:decision", (c) => {
    const id = c.req.param("id");
    const decision = c.req.param("decision");
    if (decision !== "approved" && decision !== "denied") {
      return c.json({ error: "bad decision" }, 400);
    }
    const ok = deps.approvals.decide(id, decision);
    return c.json({ ok });
  });

  app.get("/", (c) => {
    return c.html(timelineHtml(token));
  });

  const server: HttpServer = createServer(async (req, res) => {
    const host = deps.host;
    const url = new URL(req.url ?? "/", `http://${host}`);
    const headers = new Headers();
    for (const [k, v] of Object.entries(req.headers)) {
      if (typeof v === "string") headers.set(k, v);
      else if (Array.isArray(v)) headers.set(k, v.join(", "));
    }
    let body: Uint8Array | undefined;
    if (req.method !== "GET" && req.method !== "HEAD") {
      const chunks: Buffer[] = [];
      for await (const chunk of req) chunks.push(Buffer.from(chunk));
      body = Buffer.concat(chunks);
    }
    const request = new Request(url.toString(), {
      method: req.method,
      headers,
      body,
    });
    const response = await app.fetch(request);
    res.statusCode = response.status;
    response.headers.forEach((value, key) => res.setHeader(key, value));
    const buf = Buffer.from(await response.arrayBuffer());
    res.end(buf);
  });

  await new Promise<void>((resolve) => {
    server.listen(deps.port, deps.host, () => resolve());
  });
  const addr = server.address();
  if (!addr || typeof addr === "string") {
    throw new Error("failed to bind web server");
  }
  const url = `http://${deps.host}:${addr.port}/?token=${token}`;
  return {
    url,
    token,
    stop: () => {
      server.close();
    },
  };
}

function timelineHtml(token: string): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8"/>
  <title>sdfr timeline</title>
  <style>
    :root { color-scheme: light; --ink:#1a1f1c; --bg:#eef2ec; --acc:#0b6e4f; --deny:#9b2226; }
    body { font-family: "IBM Plex Sans", system-ui, sans-serif; margin:0; background:
      radial-gradient(1200px 600px at 10% -10%, #d7e8d8, transparent),
      linear-gradient(160deg, #eef2ec, #dfe7e2 60%, #cfdad3); color:var(--ink); }
    header { padding:1.25rem 1.5rem; display:flex; gap:1rem; align-items:center; justify-content:space-between; }
    h1 { font-family:"IBM Plex Serif", Georgia, serif; font-size:1.4rem; margin:0; letter-spacing:-0.02em; }
    button { background:var(--acc); color:white; border:0; padding:.5rem .9rem; cursor:pointer; }
    button.danger { background:var(--deny); }
    main { padding:0 1.5rem 2rem; }
    .badge { padding:.2rem .55rem; background:#fff; border:1px solid #b7c4ba; }
    ul { list-style:none; padding:0; margin:0; }
    li { padding:.65rem .8rem; border-bottom:1px solid #c5d0c8; background:rgba(255,255,255,.45); margin-bottom:.35rem; }
    .denied { border-left:4px solid var(--deny); }
    .allowed, .approved { border-left:4px solid var(--acc); }
    .blocked_by_brake { border-left:4px solid #bb3e03; }
  </style>
</head>
<body>
  <header>
    <h1>Agent Flight Recorder</h1>
    <div>
      <span class="badge" id="chain">chain…</span>
      <span class="badge" id="brake">brake…</span>
      <button class="danger" id="brakeBtn">Brake</button>
      <button id="releaseBtn">Release</button>
    </div>
  </header>
  <main>
    <h2>Timeline</h2>
    <ul id="events"></ul>
    <h2>Pending approvals</h2>
    <ul id="pending"></ul>
  </main>
  <script>
    const token = ${JSON.stringify(token)};
    const hdrs = { Authorization: "Bearer " + token, "Content-Type": "application/json" };
    async function refresh() {
      const st = await fetch("/api/status", { headers: hdrs }).then(r => r.json());
      document.getElementById("chain").textContent = st.chain.ok ? "chain ok" : "chain BROKEN @" + st.chain.brokenAt;
      document.getElementById("brake").textContent = st.brake ? "BRAKE ON" : "brake off";
      const events = await fetch("/api/events", { headers: hdrs }).then(r => r.json());
      document.getElementById("events").innerHTML = events.slice().reverse().map(e =>
        '<li class="'+e.decision+'"><code>'+e.ts+'</code> '+e.server+'__'+e.tool+' <strong>'+e.decision+'</strong> '+(e.policy_rule_id||'')+'</li>'
      ).join("");
      document.getElementById("pending").innerHTML = (st.pending||[]).map(p =>
        '<li>'+p.server+'__'+p.tool+
        ' <button data-id="'+p.id+'" data-d="approved">Approve</button>'+
        ' <button data-id="'+p.id+'" data-d="denied">Deny</button></li>'
      ).join("") || "<li>none</li>";
      document.querySelectorAll("#pending button").forEach(btn => btn.onclick = async () => {
        await fetch("/api/approvals/"+btn.dataset.id+"/"+btn.dataset.d, { method:"POST", headers: hdrs });
        refresh();
      });
    }
    document.getElementById("brakeBtn").onclick = async () => { await fetch("/api/brake", { method:"POST", headers: hdrs }); refresh(); };
    document.getElementById("releaseBtn").onclick = async () => { await fetch("/api/release", { method:"POST", headers: hdrs, body: JSON.stringify({ reason: "web" }) }); refresh(); };
    refresh(); setInterval(refresh, 1500);
  </script>
</body>
</html>`;
}
