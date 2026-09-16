// TET Reel-Tool — ONLINE-Spiegel (Anne 15.09.: „Das Tool muss online sein, nicht auf meinem Mac.")
// Diese App laeuft bei einem Hoster (Railway/Render/Fly) und braucht KEINE Engine: sie zeigt den letzten
// Stand, den der Rechner mit der Engine per Sync hochlaedt, und sammelt alles, was Nutzer im Tool tun,
// als Auftraege ein, die der Rechner abholt und ausfuehrt. Keine Abhaengigkeiten, nur Node >= 18.
//   ENV: PORT · COCKPIT_PASS (Login, Benutzername egal) · SYNC_SECRET (Rechner -> Spiegel) · DATA_DIR (Volume)
const http = require("http"), fs = require("fs"), path = require("path"), crypto = require("crypto");
const PORT = Number(process.env.PORT || 8080);
const PASS = process.env.COCKPIT_PASS || "";
const SECRET = process.env.SYNC_SECRET || "";
const DATA = process.env.DATA_DIR || path.join(__dirname, "data");
const ASSETS = path.join(DATA, "assets");
fs.mkdirSync(ASSETS, { recursive: true });
const INDEX = [path.join(__dirname, "index.html"), path.join(__dirname, "..", "public", "index.html")].find((f) => fs.existsSync(f));
const MIME = { ".html": "text/html; charset=utf-8", ".json": "application/json", ".mp4": "video/mp4", ".png": "image/png", ".jpg": "image/jpeg", ".jpeg": "image/jpeg", ".webp": "image/webp", ".md": "text/plain; charset=utf-8", ".txt": "text/plain; charset=utf-8", ".svg": "image/svg+xml" };

const readJSON = (f, d) => { try { return JSON.parse(fs.readFileSync(f, "utf8")); } catch { return d; } };
const writeJSON = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f + ".tmp", JSON.stringify(o)); fs.renameSync(f + ".tmp", f); };
const SNAP = path.join(DATA, "snapshot.json"), ACT = path.join(DATA, "actions.json");
let snapshot = readJSON(SNAP, {}), actions = readJSON(ACT, []);
const sendJSON = (res, code, o) => { res.writeHead(code, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" }); res.end(JSON.stringify(o)); };
const readBody = (req, limit = 50e6) => new Promise((ok, bad) => { const c = []; let n = 0; req.on("data", (d) => { n += d.length; if (n > limit) { bad(new Error("zu gross")); req.destroy(); } c.push(d); }); req.on("end", () => ok(Buffer.concat(c))); req.on("error", bad); });
const safe = (root, rel) => { const p = path.normalize(path.join(root, rel)); return p.startsWith(root) ? p : null; };

function login(req, res) {
  if (!PASS) return true;
  const h = req.headers.authorization || "";
  if (h.startsWith("Basic ")) { const [, pw] = Buffer.from(h.slice(6), "base64").toString().split(/:(.*)/s); if (pw === PASS) return true; }
  res.writeHead(401, { "WWW-Authenticate": 'Basic realm="TET Reel-Tool"', "Content-Type": "text/plain; charset=utf-8" }); res.end("Login"); return false;
}
function syncOk(req) { return SECRET && (req.headers.authorization || "") === "Bearer " + SECRET; }

function queue(type, p, method, body) {
  const a = { id: "a-" + crypto.randomBytes(5).toString("hex"), type, path: p, method, body, ts: new Date().toISOString(), status: "wartet" };
  actions.push(a); writeJSON(ACT, actions); return a;
}
// sofort sichtbare Aenderungen (Plaene) im Spiegel mitziehen, bis der Rechner den echten Stand liefert
function optimistic(p, body) {
  snapshot.state = snapshot.state || {};
  if (p === "/api/redaktionsplan" && Array.isArray(body.plan)) snapshot.state.redaktionsplan = body.plan;
  if (p === "/api/postingplan" && Array.isArray(body.plan)) snapshot.state.postingplan = body.plan;
  writeJSON(SNAP, snapshot);
}

const server = http.createServer(async (req, res) => {
  const u = new URL(req.url, "http://x"); const p = u.pathname;
  try {
    // ---------- Sync (Rechner mit Engine) ----------
    if (p.startsWith("/sync/")) {
      if (!syncOk(req)) return sendJSON(res, 401, { error: "sync" });
      if (p === "/sync/snapshot" && req.method === "POST") {
        const neu = JSON.parse((await readBody(req, 200e6)).toString("utf8"));
        neu.jobs = { ...(snapshot.jobs || {}), ...(neu.jobs || {}) };
        neu.empfangen = new Date().toISOString();
        snapshot = neu; writeJSON(SNAP, snapshot); return sendJSON(res, 200, { ok: true, actions: actions.filter((a) => a.status === "wartet").length });
      }
      if (p === "/sync/actions") return sendJSON(res, 200, { actions: actions.filter((a) => a.status === "wartet") });
      if (p === "/sync/ack" && req.method === "POST") {
        const b = JSON.parse((await readBody(req)).toString("utf8"));
        for (const r of b.results || []) { const a = actions.find((x) => x.id === r.id); if (a) { a.status = r.ok ? "erledigt" : "fehler"; a.ergebnis = r.ergebnis; a.erledigt = new Date().toISOString(); } }
        actions = actions.filter((a) => a.status === "wartet" || Date.now() - Date.parse(a.erledigt || a.ts) < 7 * 864e5);
        writeJSON(ACT, actions); return sendJSON(res, 200, { ok: true });
      }
      if (p === "/sync/assets") {
        const out = []; const walk = (d) => { for (const e of fs.readdirSync(d, { withFileTypes: true })) { const f = path.join(d, e.name); if (e.isDirectory()) walk(f); else { const st = fs.statSync(f); out.push({ path: "/" + path.relative(ASSETS, f).split(path.sep).join("/"), size: st.size, mtime: Math.floor(st.mtimeMs / 1000) }); } } };
        walk(ASSETS); return sendJSON(res, 200, { assets: out });
      }
      if (p === "/sync/asset" && req.method === "POST") {
        const rel = decodeURIComponent(u.searchParams.get("path") || ""); const f = safe(ASSETS, rel);
        if (!f) return sendJSON(res, 400, { error: "pfad" });
        fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, await readBody(req, 500e6));
        const mt = Number(u.searchParams.get("mtime") || 0); if (mt) fs.utimesSync(f, mt, mt);
        return sendJSON(res, 200, { ok: true });
      }
      if (p === "/sync/asset" && req.method === "DELETE") { const f = safe(ASSETS, decodeURIComponent(u.searchParams.get("path") || "")); if (f && fs.existsSync(f)) fs.unlinkSync(f); return sendJSON(res, 200, { ok: true }); }
      return sendJSON(res, 404, {});
    }
    if (p === "/api/online") return sendJSON(res, 200, { stand: snapshot.stand || snapshot.empfangen || null, offen: actions.filter((a) => a.status === "wartet").length });   // Health-Check, ohne Login
    // ---------- Nutzer ----------
    if (!login(req, res)) return;
    if (p === "/" || p === "/index.html") {
      let html = fs.readFileSync(INDEX, "utf8");
      const kopf = `<script>window.HOSTED=true;window.HOSTED_STAND=${JSON.stringify(snapshot.stand || snapshot.empfangen || null)};window.DROPBOX_LINKS=${JSON.stringify(snapshot.dropbox_links || {})};</script>`;
      html = html.replace(/<head>/i, "<head>" + kopf);
      res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" }); return res.end(html);
    }
    if (req.method === "GET") {
      const direkt = { "/api/state": "state", "/api/uebersicht": "uebersicht", "/api/frei": "frei", "/api/kpi": "kpi", "/api/material": "material", "/api/learnings": "learnings", "/api/claude-zugang": "claude_zugang" };
      if (direkt[p]) return sendJSON(res, 200, snapshot[direkt[p]] ?? (p === "/api/material" ? { material: [] } : {}));
      if (p.startsWith("/api/session/")) { const id = decodeURIComponent(p.split("/")[3]); return sendJSON(res, 200, (snapshot.sessions || {})[id] || { id, fehlt: true }); }
      if (p.startsWith("/api/reel/")) { const [, , , sid, slug] = p.split("/").map(decodeURIComponent); return sendJSON(res, 200, (snapshot.reels || {})[sid + "/" + slug] || { fehlt: true }); }
      if (p.startsWith("/api/job/")) {
        const id = p.split("/")[3]; const j = (snapshot.jobs || {})[id]; if (j) return sendJSON(res, 200, j);
        const a = actions.find((x) => x.id === id);
        return sendJSON(res, 200, { status: a ? (a.status === "wartet" ? "läuft" : a.status) : "läuft", log: a ? `${a.status === "wartet" ? "Wartet auf den Rechner …" : JSON.stringify(a.ergebnis || {})}` : "…" });
      }
      if (p === "/api/upload-link") return sendJSON(res, 200, { link: null, dropbox: snapshot.dropbox_links || {} });
      for (const pre of ["/files/", "/ready/", "/cover/", "/stories/"]) {
        if (p.startsWith(pre)) {
          const f = safe(ASSETS, decodeURIComponent(p)); if (!f || !fs.existsSync(f)) { res.writeHead(404); return res.end("noch nicht synchronisiert"); }
          const st = fs.statSync(f), ext = path.extname(f).toLowerCase(), type = MIME[ext] || "application/octet-stream", range = req.headers.range;
          if (range && ext === ".mp4") { const [a, b] = range.replace("bytes=", "").split("-"); const s = Number(a), e = b ? Number(b) : st.size - 1; res.writeHead(206, { "Content-Range": `bytes ${s}-${e}/${st.size}`, "Accept-Ranges": "bytes", "Content-Length": e - s + 1, "Content-Type": type }); return fs.createReadStream(f, { start: s, end: e }).pipe(res); }
          res.writeHead(200, { "Content-Type": type, "Content-Length": st.size }); return fs.createReadStream(f).pipe(res);
        }
      }
      return sendJSON(res, 404, { error: "nicht da" });
    }
    if (req.method === "POST") {
      if (p.startsWith("/api/upload")) return sendJSON(res, 400, { error: "Online bitte direkt in die Dropbox laden (Knöpfe in der Übersicht)" });
      let body = {}; try { body = JSON.parse((await readBody(req)).toString("utf8") || "{}"); } catch {}
      const a = queue("http", p, "POST", body); optimistic(p, body);
      if (p === "/api/job") return sendJSON(res, 200, { id: a.id, queued: true });
      if (p === "/api/claude") return sendJSON(res, 200, { reply: "Auftrag liegt beim Rechner — Ergebnis erscheint nach dem nächsten Sync.", queued: true, id: a.id });
      return sendJSON(res, 200, { ok: true, queued: true, id: a.id, n: Array.isArray(body.plan) ? body.plan.length : undefined });
    }
    sendJSON(res, 405, {});
  } catch (e) { sendJSON(res, 500, { error: String(e.message).slice(0, 300) }); }
});
server.listen(PORT, () => console.log(`TET Reel-Tool online auf :${PORT} · Daten ${DATA} · Login ${PASS ? "an" : "AUS"} · Sync ${SECRET ? "an" : "AUS"}`));
