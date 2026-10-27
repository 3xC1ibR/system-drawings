/* system-drawings engine.
   Renders a DRAWING object (see references/content-schema.md) as a set of
   interactive, monochrome, three-dimensional technical drawings.
   No dependencies. Orthographic camera: yaw about Y, then pitch about X. */
"use strict";
(function () {
  const D = DRAWING;
  const STATUS = { V: "VERIFIED", P: "PROPOSED", W: "IN PROGRESS", H: "HYPOTHESIS", X: "REJECTED" };
  const SHAPES = { box: [2.4, 1.0, 1.6], tall: [2.4, 1.8, 1.6], slab: [2.4, 0.28, 1.6], diamond: [2.3, 1.0, 2.3],
    column: [1.0, 1.9, 1.0], stack: [2.6, 0, 1.8], layered: [2.2, 0.55, 1.4] };
  const PLATE_T = 0.034, PLATE_GAP = 0.035, LINK_Y = 0.12;
  const INK = "#111", FAINT = "#c4c4c4", GRID = "#efefef";
  const MONO = '"IBM Plex Mono", ui-monospace, Menlo, "Courier New", monospace';
  const query = new URLSearchParams(location.search);
  const AUDIT = query.has("audit");
  const auditReport = { errors: [], sheet: null };
  window.addEventListener("error", e => auditReport.errors.push(String(e.message || e)));

  /* ---------------- sheet index, parentage, reference designators ---------------- */
  const SHEETS = {};
  D.sheets.forEach(s => { SHEETS[s.id] = s; s.byId = {}; s.parts.forEach(p => { s.byId[p.id] = p; }); s.links = s.links || []; s.traces = s.traces || []; });
  const PARENT = {};
  D.sheets.forEach(s => s.parts.forEach(p => { if (p.drill) PARENT[p.drill] = { sheet: s.id, part: p.id }; }));
  const seen = new Set();
  (function assign(id, ref) {
    if (seen.has(id) || !SHEETS[id]) return; seen.add(id);
    const s = SHEETS[id]; s.ref = ref; const base = ref.endsWith(".0") ? ref.slice(0, -2) : ref;
    s.parts.forEach((p, i) => { p.ref = base + "." + (i + 1); p._home = p.at.slice(); if (p.drill) assign(p.drill, p.ref); });
  })(D.root, "1.0");
  D.sheets.forEach(s => s.links.forEach(l => { l.key = l.from + ">" + l.to; }));
  const ORDER = []; (function walk(id) { if (!SHEETS[id] || ORDER.includes(id)) return; ORDER.push(id); SHEETS[id].parts.forEach(p => p.drill && walk(p.drill)); })(D.root);

  /* ---------------- geometry ---------------- */
  let G = 1; // global dial
  function dialValue(p) { if (!p.dial) return 1; return p.dial.scope === "global" ? G : (p.g ?? 1); }
  function dims(p) {
    const base = p.size || SHAPES[p.shape] || SHAPES.box;
    let h = base[1];
    if (p.shape === "stack") h = (p.count || 12) * (PLATE_T + PLATE_GAP);
    return { w: base[0], h, d: base[2] };
  }
  function footprint(p, inset = 0) {
    const [cx, cz] = p.at; const { w, d } = dims(p); const hw = w / 2 - inset, hd = d / 2 - inset;
    if (p.shape === "diamond") return [[cx - hw, cz], [cx, cz - hd], [cx + hw, cz], [cx, cz + hd]];
    if (p.shape === "column") { const out = []; for (let i = 0; i < 8; i++) { const a = Math.PI / 8 + i * Math.PI / 4; out.push([cx + hw * Math.cos(a), cz + hd * Math.sin(a)]); } return out; }
    return [[cx - hw, cz - hd], [cx + hw, cz - hd], [cx + hw, cz + hd], [cx - hw, cz + hd]];
  }
  function prism(poly, y0, y1) {
    const top = poly.map(([x, z]) => [x, y1, z]), bot = poly.map(([x, z]) => [x, y0, z]);
    const faces = [bot, top];
    for (let i = 0; i < poly.length; i++) { const j = (i + 1) % poly.length; faces.push([bot[i], bot[j], top[j], top[i]]); }
    return faces;
  }
  function solids(p) {
    const fp = footprint(p), { h } = dims(p), g = dialValue(p);
    if (p.shape === "stack") { const out = []; for (let i = 0; i < (p.count || 12); i++) out.push(...prism(fp, i * (PLATE_T + PLATE_GAP), i * (PLATE_T + PLATE_GAP) + PLATE_T)); return out; }
    if (p.shape === "layered") return prism(fp, 0, h).concat(prism(footprint(p, 0.16), h + 0.05, h + 0.05 + 0.03 + 0.32 * g));
    return prism(fp, 0, p.dial ? h * (0.15 + 0.85 * g) : h);
  }
  function topY(p) {
    const { h } = dims(p), g = dialValue(p);
    if (p.shape === "layered") return h + 0.08 + 0.32 * g;
    if (p.dial && p.shape !== "stack") return h * (0.15 + 0.85 * g);
    return h;
  }

  /* ---------------- camera ---------------- */
  const canvas = document.getElementById("c"), ctx = canvas.getContext("2d");
  let W = 0, H = 0;
  const camDefault = D.camera || {};
  const cam = { yaw: camDefault.yaw ?? -0.55, pitch: camDefault.pitch ?? 0.62, s: 36, px: 0, py: 0, alpha: 1, ox: 0 };
  const VIEWS = { iso: [camDefault.yaw ?? -0.55, camDefault.pitch ?? 0.62], top: [0, 1.5], front: [0, 0.12] };
  function rot(x, y, z) {
    const ca = Math.cos(cam.yaw), sa = Math.sin(cam.yaw), cb = Math.cos(cam.pitch), sb = Math.sin(cam.pitch);
    const x1 = x * ca + z * sa, z1 = -x * sa + z * ca;
    return [x1, y * cb - z1 * sb, y * sb + z1 * cb];
  }
  function P(x, y, z) { const r = rot(x, y, z); return [W / 2 + cam.ox + cam.s * (r[0] + cam.px), H / 2 - cam.s * (r[1] + cam.py), r[2]]; }

  /* ---------------- link routing: axis-aligned floor conduits ---------------- */
  function route(l) {
    const a = sheet.byId[l.from], b = sheet.byId[l.to];
    const A = [a.at[0] + (l.fromOffset?.[0] || 0), a.at[1] + (l.fromOffset?.[1] || 0)];
    const B = [b.at[0] + (l.toOffset?.[0] || 0), b.at[1] + (l.toOffset?.[1] || 0)];
    let pts;
    if (l.via) pts = [A, ...l.via, B];
    else {
      const dx = B[0] - A[0], dz = B[1] - A[1];
      const mode = l.route || (Math.abs(dx) >= Math.abs(dz) ? "x" : "z");
      if (mode === "x") { const mx = (A[0] + B[0]) / 2; pts = [A, [mx, A[1]], [mx, B[1]], B]; }
      else { const mz = (A[1] + B[1]) / 2; pts = [A, [A[0], mz], [B[0], mz], B]; }
    }
    pts = pts.filter((q, i) => i === 0 || Math.hypot(q[0] - pts[i - 1][0], q[1] - pts[i - 1][1]) > 1e-6);
    pts = pts.filter((q, i) => { if (i === 0 || i === pts.length - 1) return true; const o = pts[i - 1], r = pts[i + 1];
      return Math.abs((q[0] - o[0]) * (r[1] - o[1]) - (q[1] - o[1]) * (r[0] - o[0])) > 1e-6; });
    const clip = (end, nxt, part) => {
      const { w, d } = dims(part); const dx = nxt[0] - end[0], dz = nxt[1] - end[1];
      if (Math.abs(dx) > Math.abs(dz)) return [part.at[0] + Math.sign(dx) * (w / 2 + 0.08), end[1]];
      return [end[0], part.at[1] + Math.sign(dz) * (d / 2 + 0.08)];
    };
    pts[0] = clip(pts[0], pts[1], a);
    pts[pts.length - 1] = clip(pts[pts.length - 1], pts[pts.length - 2], b);
    return pts.map(([x, z]) => [x, LINK_Y, z]);
  }

  /* ---------------- state ---------------- */
  let path = [D.root], sheet = null, selected = null, hoverId = null;
  let trace = null, stepIdx = 0, playTimer = null, token = null, anim = null;

  /* ---------------- text ---------------- */
  function esc(s) { return String(s ?? "").replace(/[&<>"]/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c])); }
  function md(t) {
    return esc(t).replace(/`([^`]+)`/g, "<code>$1</code>").replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>")
      .replace(/\[([^\]]+)\]\((https?:[^)\s]+)\)/g, '<a href="$2" target="_blank" rel="noopener">$1</a>');
  }

  /* ---------------- drawing ---------------- */
  function focusState() {
    if (trace) {
      const st = trace.steps[stepIdx]; const lit = new Set(), litE = new Set();
      if (st.link) { const [f, t] = st.link.split(">"); lit.add(f); lit.add(t); litE.add(st.link); } else lit.add(st.part);
      return { lit, litE, active: true };
    }
    const id = hoverId || selected;
    if (!id) return { active: false, litE: new Set() };
    const lit = new Set([id]), litE = new Set();
    sheet.links.forEach(l => { if (l.from === id || l.to === id) { lit.add(l.from); lit.add(l.to); litE.add(l.key); } });
    return { lit, litE, active: !!hoverId };
  }
  function draw() {
    ctx.setTransform(devicePixelRatio, 0, 0, devicePixelRatio, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.globalAlpha = cam.alpha;
    drawGrid();
    const fs = focusState(), items = [];
    for (const p of sheet.parts) {
      const strong = !fs.active || fs.lit.has(p.id), sel = p.id === selected || (trace && fs.lit.has(p.id));
      for (const face of solids(p)) { const pts = face.map(v => P(...v)); items.push({ k: "f", pts, z: pts.reduce((s, q) => s + q[2], 0) / pts.length, strong, sel, dashed: p.status === "X" }); }
    }
    for (const l of sheet.links) {
      const pts = route(l).map(v => P(...v)), strong = !fs.active || fs.litE.has(l.key), hot = fs.litE.has(l.key);
      for (let i = 0; i < pts.length - 1; i++) items.push({ k: "s", a: pts[i], b: pts[i + 1], z: (pts[i][2] + pts[i + 1][2]) / 2 + 0.001, strong, hot, dashed: l.dashed });
      const a = pts[pts.length - 2], b = pts[pts.length - 1], u = 0.62;
      const tip = [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u, a[2] + (b[2] - a[2]) * u];
      items.push({ k: "a", a, b: tip, z: tip[2] + 0.002, strong });
      l._screen = pts; l._hot = hot;
    }
    items.sort((u, v) => u.z - v.z);
    for (const it of items) {
      if (it.k === "f") {
        ctx.beginPath(); it.pts.forEach((q, i) => i ? ctx.lineTo(q[0], q[1]) : ctx.moveTo(q[0], q[1])); ctx.closePath();
        ctx.fillStyle = "#fff"; ctx.fill(); ctx.setLineDash(it.dashed ? [4, 3] : []);
        ctx.strokeStyle = it.strong ? INK : FAINT; ctx.lineWidth = it.sel ? 1.8 : 1; ctx.lineJoin = "round"; ctx.stroke();
      } else if (it.k === "a") {
        const ang = Math.atan2(it.b[1] - it.a[1], it.b[0] - it.a[0]), s = 8, b = it.b;
        ctx.beginPath(); ctx.moveTo(b[0], b[1]);
        ctx.lineTo(b[0] - s * Math.cos(ang - 0.38), b[1] - s * Math.sin(ang - 0.38));
        ctx.lineTo(b[0] - s * Math.cos(ang + 0.38), b[1] - s * Math.sin(ang + 0.38)); ctx.closePath();
        ctx.setLineDash([]); ctx.fillStyle = it.strong ? INK : FAINT; ctx.fill();
      } else {
        ctx.beginPath(); ctx.moveTo(it.a[0], it.a[1]); ctx.lineTo(it.b[0], it.b[1]);
        ctx.setLineDash(it.dashed ? [5, 4] : []);
        ctx.strokeStyle = it.strong ? INK : FAINT; ctx.lineWidth = it.hot && (trace || hoverId || selected) ? 2 : 1; ctx.stroke();
      }
    }
    ctx.setLineDash([]);
    for (const p of sheet.parts) drawLabel(p, !fs.active || fs.lit.has(p.id));
    for (const l of sheet.links) if (l.label && l._hot && (trace || hoverId || selected)) drawLinkLabel(l);
    if (trace) drawMarks();
    if (token) drawToken();
    ctx.globalAlpha = 1;
  }
  function drawGrid() {
    const xs = sheet.parts.map(p => p.at[0]), zs = sheet.parts.map(p => p.at[1]);
    const x0 = Math.floor(Math.min(...xs) - 4), x1 = Math.ceil(Math.max(...xs) + 4), z0 = Math.floor(Math.min(...zs) - 4), z1 = Math.ceil(Math.max(...zs) + 4);
    ctx.strokeStyle = GRID; ctx.lineWidth = 1;
    for (let x = x0 - (x0 % 2); x <= x1; x += 2) { const a = P(x, 0, z0), b = P(x, 0, z1); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
    for (let z = z0 - (z0 % 2); z <= z1; z += 2) { const a = P(x0, 0, z), b = P(x1, 0, z); ctx.beginPath(); ctx.moveTo(a[0], a[1]); ctx.lineTo(b[0], b[1]); ctx.stroke(); }
  }
  function haloText(t, x, y, font, color, align = "left") {
    ctx.font = font; ctx.textAlign = align; ctx.textBaseline = "alphabetic";
    ctx.lineWidth = 4; ctx.strokeStyle = "#fff"; ctx.lineJoin = "round"; ctx.strokeText(t, x, y);
    ctx.fillStyle = color; ctx.fillText(t, x, y);
  }
  function drawLabel(p, strong) {
    const a = P(p.at[0], topY(p), p.at[1]);
    const color = strong ? INK : FAINT, color2 = strong ? "#555" : FAINT, x = a[0], y = a[1] - 14;
    ctx.strokeStyle = color; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(a[0], a[1] - 2); ctx.lineTo(x, y + 4); ctx.stroke();
    const l1 = `${p.ref}  ${p.label}  [${p.status}]`;
    const l2 = (p.sub || "") + (p.drill ? `  ▸ SHEET ${SHEETS[p.drill].ref}` : "");
    haloText(l2, x, y, `10px ${MONO}`, color2, "center");
    haloText(l1, x, y - 13, `600 11px ${MONO}`, color, "center");
    ctx.font = `600 11px ${MONO}`; const w1 = ctx.measureText(l1).width; ctx.font = `10px ${MONO}`;
    const w = Math.max(w1, ctx.measureText(l2).width);
    p._label = [x - w / 2 - 4, y - 26, w + 8, 32];
  }
  function drawLinkLabel(l) {
    // Candidate positions along every segment, longest segments first; take the first that clears all part labels.
    const pts = l._screen, segs = [];
    for (let i = 0; i < pts.length - 1; i++) segs.push([Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][1] - pts[i][1]), i]);
    segs.sort((a, b) => b[0] - a[0]);
    ctx.font = `10px ${MONO}`; const w = ctx.measureText(l.label).width + 8, h = 14;
    const clear = (x, y) => sheet.parts.every(p => { const r = p._label; return !r || x + w / 2 < r[0] || x - w / 2 > r[0] + r[2] || y < r[1] || y - h > r[1] + r[3]; });
    let pos = null;
    for (const [, i] of segs) {
      for (const u of [0.5, 0.3, 0.7]) {
        const x = pts[i][0] + (pts[i + 1][0] - pts[i][0]) * u, y = pts[i][1] + (pts[i + 1][1] - pts[i][1]) * u;
        for (const [dx, dy] of [[0, -6], [w / 2 + 8, 4], [-w / 2 - 8, 4], [0, 16]]) if (clear(x + dx, y + dy)) { pos = [x + dx, y + dy]; break; }
        if (pos) break;
      }
      if (pos) break;
    }
    // No clear position: omit the canvas label; the data sheet's CONNECTIONS table still names the link.
    if (pos) haloText(l.label, pos[0], pos[1], `10px ${MONO}`, "#555", "center");
  }
  function drawMarks() {
    trace.steps.slice(0, stepIdx + 1).forEach(st => {
      if (!st.mark) return;
      const p = sheet.byId[st.mark[0]]; if (!p || !p._label) return;
      const [lx, ly, lw] = p._label, t = st.mark[1];
      ctx.font = `600 10.5px ${MONO}`; const w = ctx.measureText(t).width + 12, x = lx + lw / 2 - w / 2, y = ly - 22;
      ctx.fillStyle = "#fff"; ctx.fillRect(x, y, w, 17); ctx.strokeStyle = INK; ctx.lineWidth = 1; ctx.strokeRect(x + .5, y + .5, w - 1, 16);
      ctx.fillStyle = INK; ctx.textAlign = "left"; ctx.fillText(t, x + 6, y + 12);
    });
  }
  function drawToken() {
    const k = Math.min(1, (performance.now() - token.t0) / token.dur), e = 1 - Math.pow(1 - k, 2), pts = token.pts;
    let total = 0; const seg = [];
    for (let i = 0; i < pts.length - 1; i++) { const d = Math.hypot(pts[i + 1][0] - pts[i][0], pts[i + 1][2] - pts[i][2]); seg.push(d); total += d; }
    let target = total * e, i = 0; while (i < seg.length - 1 && target > seg[i]) { target -= seg[i]; i++; }
    const u = seg[i] ? target / seg[i] : 0, a = pts[i], b = pts[i + 1];
    const q = P(a[0] + (b[0] - a[0]) * u, LINK_Y, a[2] + (b[2] - a[2]) * u);
    ctx.fillStyle = INK; ctx.fillRect(q[0] - 4, q[1] - 4, 8, 8);
    if (k >= 1) token.done = true;
  }

  /* ---------------- heads-up display ---------------- */
  const panel = document.getElementById("sheet");
  function setHud() {
    const nav = document.getElementById("path"); nav.innerHTML = "";
    path.forEach((id, i) => {
      if (i) { const s = document.createElement("span"); s.className = "sep"; s.textContent = "/"; nav.appendChild(s); }
      const b = document.createElement("button"); b.textContent = `${SHEETS[id].ref} ${SHEETS[id].short || SHEETS[id].title.toUpperCase()}`;
      if (i === path.length - 1) b.setAttribute("aria-current", "page"); else b.onclick = () => goBackTo(i);
      nav.appendChild(b);
    });
    document.getElementById("title").textContent = sheet.title;
    document.getElementById("purpose").textContent = sheet.purpose || "";
    document.getElementById("tblock").innerHTML =
      `<div><span>${esc(D.project)}</span><span>REV ${esc(D.revision || "A")}</span></div>
       <div><span>SHEET ${sheet.ref}</span><span>${ORDER.indexOf(sheet.id) + 1} OF ${ORDER.length}</span></div>
       <div><span>LEVEL ${path.length}</span><span>${esc(D.date || "")}</span></div>
       <div><span>[V] VERIFIED · [P] PROPOSED · [W] IN PROGRESS · [H] HYPOTHESIS · [X] REJECTED · ▸ OPENS A SHEET</span><span></span></div>`;
    const tb = document.getElementById("tracebtns"); tb.innerHTML = "";
    document.getElementById("tracebar").style.display = sheet.traces.length ? "" : "none";
    sheet.traces.forEach(t => { const b = document.createElement("button"); b.textContent = t.label; b.setAttribute("aria-pressed", trace && trace.id === t.id ? "true" : "false"); b.onclick = () => startTrace(t); tb.appendChild(b); });
  }
  function kv(k, v) { return `<div class="kv"><span class="k">${md(k)}</span><span class="lead"></span><span class="v">${md(v)}</span></div>`; }
  function openPanel(html) { panel.innerHTML = `<button class="x" aria-label="Close data sheet">✕</button>` + html; panel.classList.add("on"); panel.querySelector(".x").onclick = closePanel; panelShift(true); }
  function closePanel() { panel.classList.remove("on"); selected = null; panelShift(false); draw(); }
  function panelShift(on) { const target = on && W > 900 ? -190 : 0; if (anim) anim.to.ox = target; else if (cam.ox !== target) animate({ ox: target }, 260); }
  function showPart(p) {
    let h = `<div class="ref">REF ${p.ref} · DATA SHEET</div><h2>${esc(p.label)}</h2><div class="st">STATUS: ${STATUS[p.status]}</div>`;
    if (p.what) h += `<h3>FUNCTION</h3><p>${md(p.what)}</p>`;
    if (p.why) h += `<h3>RATIONALE</h3><p>${md(p.why)}</p>`;
    if (p.dial) h += dialHtml(p);
    if (p.figure) h += figureHtml(p.figure);
    if (p.params) h += `<h3>PARAMETERS</h3>` + p.params.map(([k, v]) => kv(k, v)).join("");
    if (p.note) h += `<p class="note">${md(p.note)}</p>`;
    if (p.refs) h += `<h3>REFERENCES</h3><ul>${p.refs.map(([t, u]) => `<li><a href="${esc(u)}" target="_blank" rel="noopener">${esc(t)}</a></li>`).join("")}</ul>`;
    const conns = sheet.links.filter(l => l.from === p.id || l.to === p.id);
    if (conns.length) h += `<h3>CONNECTIONS</h3>` + conns.map(l => kv(l.from === p.id ? "→ " + sheet.byId[l.to].label : "← " + sheet.byId[l.from].label, l.label || "")).join("");
    openPanel(h); wireDial(p); wireFigure(p.figure);
  }
  function showPartSummary(p) {
    const s = SHEETS[p.drill];
    let h = `<div class="ref">REF ${p.ref} · SUBSYSTEM</div><h2>${esc(p.label)}</h2><div class="st">STATUS: ${STATUS[p.status]}</div><h3>FUNCTION</h3><p>${md(p.what || s.purpose)}</p>`;
    if (p.why) h += `<h3>RATIONALE</h3><p>${md(p.why)}</p>`;
    h += `<h3>CONTAINS</h3>` + s.parts.map(q => `<div class="kv"><span class="k">${esc(q.label)}</span></div>`).join("") + `<button class="open">OPEN SHEET ${s.ref} ▸</button>`;
    openPanel(h); panel.querySelector(".open").onclick = () => drillInto(p);
  }
  function showSheetIndex() {
    let h = `<div class="ref">SHEET ${sheet.ref} · INDEX</div><h2>${esc(sheet.title)}</h2><p>${md(sheet.purpose || "")}</p><h3>PARTS ON THIS SHEET</h3><div class="idx">` +
      sheet.parts.map(p => `<button data-id="${p.id}"><span class="r">${p.ref}</span><span>${esc(p.label)}${p.drill ? "  ▸" : ""}</span></button>`).join("") + `</div>`;
    openPanel(h);
    panel.querySelectorAll(".idx button").forEach(b => b.onclick = () => activate(sheet.byId[b.dataset.id]));
  }
  function showNote(n) {
    const body = (n.blocks || []).map(b => {
      if (b.h) return `<h3>${esc(b.h)}</h3>`;
      if (b.p) return `<p>${md(b.p)}</p>`;
      if (b.list) return `<ul>${b.list.map(i => `<li>${md(i)}</li>`).join("")}</ul>`;
      if (b.kv) return b.kv.map(([k, v]) => kv(k, v)).join("");
      if (b.note) return `<p class="note">${md(b.note)}</p>`;
      return "";
    }).join("");
    openPanel(`<div class="ref">${esc(n.ref || "NOTE")}</div><h2>${esc(n.title)}</h2>${body}`);
  }

  /* ---------------- dials and figures ---------------- */
  function dialHtml(p) {
    const v = dialValue(p), d = p.dial;
    const formula = esc(d.formula || "SCALE = {g}").replace("{g}", `<b class="gv">${v.toFixed(2)}</b>`);
    return `<h3>${esc(d.title || (d.scope === "global" ? "DIAL · ALL PARTS" : "DIAL"))}</h3><p>${formula}</p>
      <input type="range" min="0" max="1" step="${d.step || 0.25}" value="${v}" aria-label="Dial value">
      <div class="ticks"><span>0</span><span>.25</span><span>.50</span><span>.75</span><span>1</span></div>
      <p class="gtext" style="color:#555"></p>${d.caption ? `<p class="small">${md(d.caption)}</p>` : ""}`;
  }
  function stateText(states, v) {
    if (!states) return "";
    const t = v === 1 && states["1"] ? states["1"] : v === 0 && states["0"] ? states["0"] : states.mid || "";
    return t.replace(/\{g\}/g, v.toFixed(2)).replace(/\{pct\}/g, String(Math.round(v * 100)));
  }
  function wireDial(p) {
    const r = panel.querySelector('input[aria-label="Dial value"]'); if (!r) return;
    const gv = panel.querySelector(".gv"), tx = panel.querySelector(".gtext");
    const upd = () => { const v = +r.value; if (p.dial.scope === "global") G = v; else p.g = v; if (gv) gv.textContent = v.toFixed(2); tx.innerHTML = md(stateText(p.dial.states, v)); draw(); };
    r.oninput = upd; upd();
  }
  function figureHtml(f) {
    if (f.type !== "interpolation") return "";
    const M = (x, y) => [34 + x * 258, 160 - y * 152];
    const [ax, ay] = M(f.from.x, f.from.y), [bx, by] = M(f.to.x, f.to.y), [cx, cy] = M(...(f.bend || [(f.from.x + f.to.x) / 2, (f.from.y + f.to.y) / 2]));
    let tgt = "";
    if (f.target) { const [tx, ty] = M(f.target.x, f.target.y + f.target.h); tgt = `<rect x="${tx}" y="${ty}" width="${f.target.w * 258}" height="${f.target.h * 152}" fill="none" stroke="#111" stroke-dasharray="3 3"/><text x="${tx + f.target.w * 129}" y="${ty + f.target.h * 76 + 4}" text-anchor="middle">${esc(f.target.label || "TARGET")}</text>`; }
    return `<h3>${esc(f.title || "CONCEPT")}</h3>
      <svg viewBox="0 0 300 190" width="100%" role="img" aria-label="${esc(f.title || "Concept figure")}" data-q="${ax},${ay},${cx},${cy},${bx},${by}">
        <line x1="34" y1="160" x2="292" y2="160" stroke="#111"/><line x1="34" y1="8" x2="34" y2="160" stroke="#111"/>
        <text x="292" y="176" text-anchor="end">${esc(f.xLabel || "")} →</text><text x="40" y="18">${esc(f.yLabel || "")} ↑</text>${tgt}
        <path d="M${ax},${ay} Q${cx},${cy} ${bx},${by}" fill="none" stroke="#111" stroke-dasharray="4 3"/>
        <rect x="${ax - 4}" y="${ay - 4}" width="8" height="8" fill="#111"/><text x="${ax + 10}" y="${ay - 6}">${esc(f.from.label)}</text>
        <rect x="${bx - 4}" y="${by - 4}" width="8" height="8" fill="#111"/><text x="${bx - 6}" y="${by + 18}" text-anchor="end">${esc(f.to.label)}</text>
        <circle class="fdot" cx="${bx}" cy="${by}" r="7" fill="none" stroke="#111" stroke-width="1.5"/>
      </svg>
      <input type="range" class="frange" min="0" max="1" step="0.05" value="1" aria-label="${esc(f.slider || "Position")}">
      <p class="ftext" style="color:#555"></p>${f.caption ? `<p class="small">${md(f.caption)}</p>` : ""}`;
  }
  function wireFigure(f) {
    const r = panel.querySelector(".frange"); if (!r || !f) return;
    const svg = panel.querySelector("svg[data-q]"), q = svg.dataset.q.split(",").map(Number), dot = svg.querySelector(".fdot"), tx = panel.querySelector(".ftext");
    const upd = () => { const u = +r.value;
      dot.setAttribute("cx", (1 - u) ** 2 * q[0] + 2 * (1 - u) * u * q[2] + u * u * q[4]);
      dot.setAttribute("cy", (1 - u) ** 2 * q[1] + 2 * (1 - u) * u * q[3] + u * u * q[5]);
      tx.innerHTML = md(`${(f.slider || "POSITION").toUpperCase()} ${u.toFixed(2)} — ${stateText(f.states, u)}`); };
    r.oninput = upd; upd();
  }

  /* ---------------- navigation and animation ---------------- */
  function fitParams() {
    const save = { s: cam.s, px: cam.px, py: cam.py }; cam.s = 1; cam.px = 0; cam.py = 0;
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9;
    for (const p of sheet.parts) for (const f of solids(p)) for (const v of f) { const r = rot(...v); x0 = Math.min(x0, r[0]); x1 = Math.max(x1, r[0]); y0 = Math.min(y0, r[1]); y1 = Math.max(y1, r[1]); }
    Object.assign(cam, save);
    const open = panel.classList.contains("on") && W > 900, ox = open ? -190 : 0;
    const L = 40, R = W - (open ? 420 : 40), T = 150, B = H - 150;
    const s = Math.min((R - L) / (x1 - x0), (B - T) / (y1 - y0 + 1.2)) * 0.95;
    const ux = (L + R) / 2, uy = (T + B) / 2 + 20;
    return { s, ox, px: (ux - W / 2 - ox) / s - (x0 + x1) / 2, py: (H / 2 - uy) / s - (y0 + y1) / 2 };
  }
  function animate(to, dur, then) { anim = { from: { ...cam }, to, t0: performance.now(), dur, then }; tick(); }
  let queued = false;
  function tick() { if (!queued) { queued = true; requestAnimationFrame(loop); } }
  function loop(now) {
    queued = false; let more = false;
    if (anim) {
      const k = Math.min(1, (now - anim.t0) / anim.dur), e = k < .5 ? 2 * k * k : 1 - Math.pow(-2 * k + 2, 2) / 2;
      for (const key in anim.to) cam[key] = anim.from[key] + (anim.to[key] - anim.from[key]) * e;
      if (k >= 1) { const t = anim.then; anim = null; if (t) t(); } else more = true;
    }
    if (token && !token.done) more = true;
    draw();
    if (more || anim) tick();
  }
  function centerOn(p, scale) { const r = rot(p.at[0], topY(p) / 2, p.at[1]); return { s: scale, px: -r[0], py: -r[1] }; }
  function load(id) { sheet = SHEETS[id]; selected = null; hoverId = null; stopTrace(true); setHud(); history.replaceState(null, "", location.pathname + location.search + "#" + id); }
  function drillInto(p) {
    stopTrace(true);
    animate({ ...centerOn(p, cam.s * 3.2), alpha: 0 }, 380, () => {
      path.push(p.drill); load(p.drill); showSheetIndex();
      const f = fitParams(); Object.assign(cam, { s: f.s * 0.8, px: f.px, py: f.py, ox: f.ox, alpha: 0 });
      animate({ ...f, alpha: 1 }, 380);
    });
  }
  function goBackTo(i) {
    if (i >= path.length - 1) return;
    const leaving = path[i + 1];
    animate({ s: cam.s * 0.6, alpha: 0 }, 320, () => {
      path = path.slice(0, i + 1); load(path[path.length - 1]);
      const parent = sheet.parts.find(p => p.drill === leaving);
      if (parent) { selected = parent.id; showPartSummary(parent); } else closePanel();
      const f = fitParams();
      if (parent) Object.assign(cam, { ...centerOn(parent, f.s * 3.2), ox: f.ox, alpha: 0 }); else Object.assign(cam, { ...f, alpha: 0 });
      animate({ ...f, alpha: 1 }, 380);
    });
  }
  function activate(p) { if (p.drill) { selected = p.id; drillInto(p); return; } selected = p.id; showPart(p); draw(); }

  /* ---------------- traces ---------------- */
  function startTrace(t) { stopTrace(true); trace = t; stepIdx = 0; document.getElementById("cap").classList.add("on"); setHud(); showStep(); }
  function stopTrace(silent) {
    clearInterval(playTimer); playTimer = null; const pb = document.getElementById("play"); pb.setAttribute("aria-pressed", "false"); pb.textContent = "PLAY";
    trace = null; token = null; document.getElementById("cap").classList.remove("on");
    if (!silent) { setHud(); draw(); }
  }
  function showStep() {
    const st = trace.steps[stepIdx];
    document.getElementById("capn").textContent = `TRACE ${trace.label} · STEP ${String(stepIdx + 1).padStart(2, "0")} OF ${String(trace.steps.length).padStart(2, "0")}`;
    document.getElementById("capt").innerHTML = md(st.text);
    token = null;
    if (st.link) { const l = sheet.links.find(x => x.key === st.link); if (l) token = { pts: route(l), t0: performance.now(), dur: 900 }; }
    const focus = st.part || st.link.split(">")[1], p = sheet.byId[focus];
    selected = focus;
    if (p && !p.drill) showPart(p); else if (p) showPartSummary(p);
    tick();
  }
  function step(d) { if (!trace) return; stepIdx = Math.max(0, Math.min(trace.steps.length - 1, stepIdx + d)); showStep(); }
  document.getElementById("prev").onclick = () => step(-1);
  document.getElementById("next").onclick = () => step(1);
  document.getElementById("end").onclick = () => stopTrace();
  document.getElementById("play").onclick = ev => {
    const b = ev.currentTarget;
    if (playTimer) { clearInterval(playTimer); playTimer = null; b.setAttribute("aria-pressed", "false"); b.textContent = "PLAY"; return; }
    b.setAttribute("aria-pressed", "true"); b.textContent = "PAUSE";
    playTimer = setInterval(() => { if (!trace || stepIdx >= trace.steps.length - 1) { clearInterval(playTimer); playTimer = null; b.setAttribute("aria-pressed", "false"); b.textContent = "PLAY"; return; } step(1); }, 2800);
  };

  /* ---------------- pointer input ---------------- */
  function hull(pts) {
    pts = pts.slice().sort((a, b) => a[0] - b[0] || a[1] - b[1]);
    const cross = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]), lo = [], up = [];
    for (const p of pts) { while (lo.length >= 2 && cross(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
    for (let i = pts.length - 1; i >= 0; i--) { const p = pts[i]; while (up.length >= 2 && cross(up[up.length - 2], up[up.length - 1], p) <= 0) up.pop(); up.push(p); }
    return lo.slice(0, -1).concat(up.slice(0, -1));
  }
  function inPoly(x, y, poly) {
    let inside = false;
    for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) inside = !inside; }
    return inside;
  }
  function pick(x, y) {
    let best = null, bz = -1e9;
    for (const p of sheet.parts) {
      const pts = []; for (const f of solids(p)) for (const v of f) pts.push(P(...v));
      const z = P(p.at[0], topY(p), p.at[1])[2], lb = p._label;
      const onLabel = lb && x >= lb[0] && x <= lb[0] + lb[2] && y >= lb[1] && y <= lb[1] + lb[3];
      if ((onLabel || inPoly(x, y, hull(pts.map(q => [q[0], q[1]])))) && z > bz) { best = p; bz = z; }
    }
    return best;
  }
  let drag = null;
  canvas.addEventListener("pointerdown", ev => {
    canvas.focus(); canvas.setPointerCapture(ev.pointerId);
    drag = { x: ev.offsetX, y: ev.offsetY, part: pick(ev.offsetX, ev.offsetY), moved: false, pan: ev.shiftKey || ev.button === 2 };
    canvas.classList.add("dragging");
  });
  canvas.addEventListener("pointermove", ev => {
    if (!drag) { const p = pick(ev.offsetX, ev.offsetY), id = p ? p.id : null; canvas.classList.toggle("over", !!p); if (id !== hoverId) { hoverId = id; draw(); } return; }
    const dx = ev.offsetX - drag.x, dy = ev.offsetY - drag.y;
    if (!drag.moved && Math.hypot(dx, dy) < 4) return;
    drag.moved = true; drag.x = ev.offsetX; drag.y = ev.offsetY;
    if (drag.part && !drag.pan) {
      const a = cam.yaw, sb = Math.max(0.15, Math.sin(cam.pitch)), u = dx / cam.s, v = dy / (cam.s * sb);
      drag.part.at = [drag.part.at[0] + u * Math.cos(a) - v * Math.sin(a), drag.part.at[1] + u * Math.sin(a) + v * Math.cos(a)];
    } else if (drag.pan) { cam.px += dx / cam.s; cam.py -= dy / cam.s; }
    else { cam.yaw += dx * 0.006; cam.pitch = Math.max(0.05, Math.min(1.52, cam.pitch + dy * 0.006)); }
    draw();
  });
  canvas.addEventListener("pointerup", () => {
    canvas.classList.remove("dragging");
    if (drag && !drag.moved) { if (drag.part) activate(drag.part); else if (!trace) closePanel(); }
    drag = null;
  });
  canvas.addEventListener("contextmenu", ev => ev.preventDefault());
  canvas.addEventListener("wheel", ev => {
    ev.preventDefault();
    const ns = Math.max(4, Math.min(400, cam.s * Math.exp(-ev.deltaY * 0.0015))), mx = ev.offsetX, my = ev.offsetY;
    const wx = (mx - W / 2 - cam.ox) / cam.s - cam.px, wy = -(my - H / 2) / cam.s - cam.py;
    cam.px = (mx - W / 2 - cam.ox) / ns - wx; cam.py = -(my - H / 2) / ns - wy; cam.s = ns; draw();
  }, { passive: false });
  canvas.addEventListener("dblclick", ev => { const p = pick(ev.offsetX, ev.offsetY); if (p && p.at.join() !== p._home.join()) { p.at = p._home.slice(); draw(); } });

  document.querySelectorAll("[data-view]").forEach(b => b.onclick = () => {
    const v = b.dataset.view;
    if (v === "fit") { animate(fitParams(), 400); return; }
    const [yaw, pitch] = VIEWS[v], save = { yaw: cam.yaw, pitch: cam.pitch };
    cam.yaw = yaw; cam.pitch = pitch; const f = fitParams(); Object.assign(cam, save);
    animate({ yaw, pitch, ...f }, 500);
  });
  document.getElementById("zin").onclick = () => animate({ s: cam.s * 1.25 }, 200);
  document.getElementById("zout").onclick = () => animate({ s: cam.s / 1.25 }, 200);
  document.getElementById("index").onclick = () => showSheetIndex();
  const notesRow = document.getElementById("notes");
  (D.notes || []).forEach(n => { const b = document.createElement("button"); b.textContent = n.button || n.title.toUpperCase(); b.onclick = () => showNote(n); notesRow.appendChild(b); });

  document.addEventListener("keydown", ev => {
    if (ev.target.tagName === "INPUT") return;
    if (ev.key === "Escape") { if (trace) stopTrace(); else if (panel.classList.contains("on")) closePanel(); else if (path.length > 1) goBackTo(path.length - 2); }
    else if (trace && ev.key === "ArrowRight") step(1);
    else if (trace && ev.key === "ArrowLeft") step(-1);
    else if (document.activeElement === canvas && ev.key === "Tab") {
      ev.preventDefault(); const ids = sheet.parts.map(p => p.id), i = ids.indexOf(selected);
      const n = sheet.parts[(i + (ev.shiftKey ? -1 : 1) + ids.length) % ids.length]; selected = n.id; n.drill ? showPartSummary(n) : showPart(n); draw();
    } else if (document.activeElement === canvas && ev.key === "Enter" && selected) activate(sheet.byId[selected]);
  });
  function resize() { W = canvas.clientWidth; H = canvas.clientHeight; canvas.width = Math.round(W * devicePixelRatio); canvas.height = Math.round(H * devicePixelRatio); }
  window.addEventListener("resize", () => { resize(); draw(); });

  /* ---------------- audit (used by scripts/inspect_drawing.py) ---------------- */
  function runAudit() {
    const rects = sheet.parts.map(p => ({ id: p.id, r: p._label })), overlaps = [], outside = [], hud = [];
    const inter = (a, b) => Math.max(0, Math.min(a[0] + a[2], b[0] + b[2]) - Math.max(a[0], b[0])) * Math.max(0, Math.min(a[1] + a[3], b[1] + b[3]) - Math.max(a[1], b[1]));
    for (let i = 0; i < rects.length; i++) for (let j = i + 1; j < rects.length; j++) { const a = inter(rects[i].r, rects[j].r); if (a > 16) overlaps.push([rects[i].id, rects[j].id, Math.round(a)]); }
    const zones = [["header", [0, 0, 720, 118]], ["controls", [W - 400, 0, 400, 118]], ["title block", [W - 390, H - 140, 390, 140]], ["trace bar", [0, H - 60, 560, 60]]];
    for (const { id, r } of rects) {
      if (r[0] < 0 || r[1] < 0 || r[0] + r[2] > W || r[1] + r[3] > H) outside.push(id);
      for (const [name, z] of zones) if (inter(r, z) > 16) hud.push([id, name]);
    }
    const fpOverlaps = [];
    const box = p => { const { w, d } = dims(p); return [p.at[0] - w / 2, p.at[1] - d / 2, w, d]; };
    for (let i = 0; i < sheet.parts.length; i++) for (let j = i + 1; j < sheet.parts.length; j++) if (inter(box(sheet.parts[i]), box(sheet.parts[j])) > 0) fpOverlaps.push([sheet.parts[i].id, sheet.parts[j].id]);
    auditReport.sheet = { id: sheet.id, ref: sheet.ref, parts: sheet.parts.length, links: sheet.links.length, traces: sheet.traces.length,
      labelOverlaps: overlaps, labelsOutsideCanvas: outside, labelsUnderHud: hud, footprintOverlaps: fpOverlaps, viewport: [W, H] };
    const pre = document.createElement("pre"); pre.id = "audit"; pre.className = "sr"; pre.textContent = JSON.stringify(auditReport); document.body.appendChild(pre);
  }

  /* ---------------- start ---------------- */
  (function init() {
    const want = location.hash.slice(1);
    if (SHEETS[want]) { const chain = [want]; while (PARENT[chain[0]]) chain.unshift(PARENT[chain[0]].sheet); path = chain; }
    load(path[path.length - 1]);
    resize();
    Object.assign(cam, fitParams());
    draw();
    if (query.get("trace")) { const t = sheet.traces.find(x => x.id === query.get("trace")); if (t) { startTrace(t); stepIdx = Math.min(+(query.get("step") || 1) - 1, t.steps.length - 1); showStep(); } }
    if (query.get("part") && sheet.byId[query.get("part")]) { const p = sheet.byId[query.get("part")]; selected = p.id; p.drill ? showPartSummary(p) : showPart(p); }
    if (AUDIT) { cam.ox = 0; draw(); runAudit(); }
    else draw();
  })();
})();
