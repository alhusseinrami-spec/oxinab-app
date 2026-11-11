/* Oxinab Command Center: bulk stock and price update by spreadsheet.
   Download all products as Excel (.xlsx) or CSV, edit Price, Stock and Online, upload it back,
   check the preview, apply, then "Publish changes" as usual. No outside library: the .xlsx is a small zip
   of XML written and read here. Uses helpers from admin.js ($, esc, W, toast, state, render). */
const BK_HEAD = ["Ref", "Name", "Name (Arabic)", "Category", "Price ($)", "Stock", "Online (yes/no)"];

/* ---------- zip (stored on write; stored or deflated on read) ---------- */
const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
const crc32 = (b) => { let c = 0xffffffff; for (let i = 0; i < b.length; i++) c = CRC[(c ^ b[i]) & 255] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };
function zip(files) {
  const enc = new TextEncoder(), parts = [], dir = []; let off = 0;
  for (const [name, text] of files) {
    const nb = enc.encode(name), data = enc.encode(text), crc = crc32(data);
    const h = new DataView(new ArrayBuffer(30));
    h.setUint32(0, 0x04034b50, true); h.setUint16(4, 20, true); h.setUint16(6, 0x0800, true); h.setUint16(8, 0, true);
    h.setUint32(14, crc, true); h.setUint32(18, data.length, true); h.setUint32(22, data.length, true); h.setUint16(26, nb.length, true);
    parts.push(new Uint8Array(h.buffer), nb, data);
    const c = new DataView(new ArrayBuffer(46));
    c.setUint32(0, 0x02014b50, true); c.setUint16(4, 20, true); c.setUint16(6, 20, true); c.setUint16(8, 0x0800, true);
    c.setUint32(16, crc, true); c.setUint32(20, data.length, true); c.setUint32(24, data.length, true); c.setUint16(28, nb.length, true); c.setUint32(42, off, true);
    dir.push(new Uint8Array(c.buffer), nb);
    off += 30 + nb.length + data.length;
  }
  const size = dir.reduce((s, x) => s + x.length, 0), e = new DataView(new ArrayBuffer(22));
  e.setUint32(0, 0x06054b50, true); e.setUint16(8, files.length, true); e.setUint16(10, files.length, true); e.setUint32(12, size, true); e.setUint32(16, off, true);
  return new Blob([...parts, ...dir, new Uint8Array(e.buffer)]);
}
async function unzip(buf) {
  const v = new DataView(buf), u8 = new Uint8Array(buf), dec = new TextDecoder(), out = {};
  let e = buf.byteLength - 22; while (e >= 0 && v.getUint32(e, true) !== 0x06054b50) e--;
  if (e < 0) throw new Error("not_zip");
  let p = v.getUint32(e + 16, true); const n = v.getUint16(e + 10, true);
  for (let i = 0; i < n; i++) {
    const method = v.getUint16(p + 10, true), csize = v.getUint32(p + 20, true), nl = v.getUint16(p + 28, true), xl = v.getUint16(p + 30, true), cl = v.getUint16(p + 32, true), lo = v.getUint32(p + 42, true);
    const name = dec.decode(u8.subarray(p + 46, p + 46 + nl));
    const start = lo + 30 + v.getUint16(lo + 26, true) + v.getUint16(lo + 28, true), raw = u8.subarray(start, start + csize);
    out[name] = { method, raw };
    p += 46 + nl + xl + cl;
  }
  const text = async (name) => {
    const f = out[name]; if (!f) return null;
    if (f.method === 0) return dec.decode(f.raw);
    if (f.method !== 8 || typeof DecompressionStream === "undefined") throw new Error("unsupported_zip");
    return await new Response(new Blob([f.raw]).stream().pipeThrough(new DecompressionStream("deflate-raw"))).text();
  };
  return { names: Object.keys(out), text };
}

/* ---------- write ---------- */
const xe = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
const colL = (i) => { let s = ""; i++; while (i) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
function bkRows() {
  return W.items.map((i) => [i.id, i.n, i.a || "", (W.cats[i.k] || {}).n || "", i.p || 0, i.s == null ? "" : i.s, i.off ? "no" : "yes"]);
}
function bkXlsx() {
  const rows = [BK_HEAD, ...bkRows()];
  const sheet = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews><cols><col min="1" max="1" width="16" customWidth="1"/><col min="2" max="3" width="46" customWidth="1"/><col min="4" max="4" width="26" customWidth="1"/><col min="5" max="7" width="15" customWidth="1"/></cols><sheetData>`
    + rows.map((r, ri) => `<row r="${ri + 1}">` + r.map((v, ci) => {
      const a = colL(ci) + (ri + 1), st = ri === 0 ? ' s="1"' : ci >= 4 ? ' s="2"' : ci < 4 ? ' s="3"' : "";
      return typeof v === "number" ? `<c r="${a}"${st}><v>${v}</v></c>` : v === "" ? `<c r="${a}"${st}/>` : `<c r="${a}" t="inlineStr"${st}><is><t xml:space="preserve">${xe(v)}</t></is></c>`;
    }).join("") + `</row>`).join("") + `</sheetData><autoFilter ref="A1:G${rows.length}"/></worksheet>`;
  return zip([
    ["[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/></Types>`],
    ["_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>`],
    ["xl/workbook.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="Products" sheetId="1" r:id="rId1"/></sheets><definedNames><definedName name="_xlnm._FilterDatabase" localSheetId="0" hidden="1">Products!$A$1:$G$${rows.length}</definedName></definedNames></workbook>`],
    ["xl/_rels/workbook.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>`],
    ["xl/styles.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Calibri"/></font></fonts><fills count="4"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FF001765"/></patternFill></fill><fill><patternFill patternType="solid"><fgColor rgb="FFF3F6FA"/></patternFill></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders><cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="4"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="2" borderId="0" xfId="0" applyFont="1" applyFill="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="0" fillId="3" borderId="0" xfId="0" applyFill="1"/></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`],
    ["xl/worksheets/sheet1.xml", sheet],
  ]);
}
function bkCsv() {
  const q = (v) => { const s = String(v); return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s; };
  return new Blob(["﻿" + [BK_HEAD, ...bkRows()].map((r) => r.map(q).join(",")).join("\r\n")], { type: "text/csv;charset=utf-8" });
}
function bkSave(blob, name) { const a = document.createElement("a"); a.href = URL.createObjectURL(blob); a.download = name; document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000); }

/* ---------- read ---------- */
function parseCsv(text) {
  text = text.replace(/^﻿/, "");
  const first = text.split(/\r?\n/, 1)[0], d = (first.match(/;/g) || []).length > (first.match(/,/g) || []).length ? ";" : (first.includes("\t") && !first.includes(",") ? "\t" : ",");
  const rows = []; let row = [], cur = "", inq = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inq) { if (ch === '"') { if (text[i + 1] === '"') { cur += '"'; i++; } else inq = false; } else cur += ch; }
    else if (ch === '"') inq = true;
    else if (ch === d) { row.push(cur); cur = ""; }
    else if (ch === "\n" || ch === "\r") { if (ch === "\r" && text[i + 1] === "\n") i++; row.push(cur); rows.push(row); row = []; cur = ""; }
    else cur += ch;
  }
  if (cur !== "" || row.length) { row.push(cur); rows.push(row); }
  return rows;
}
async function parseXlsx(buf) {
  const z = await unzip(buf), P = (s) => new DOMParser().parseFromString(s, "application/xml");
  let path = "xl/worksheets/sheet1.xml";
  try {
    const wb = P(await z.text("xl/workbook.xml")), rid = wb.getElementsByTagName("sheet")[0].getAttribute("r:id");
    const rel = [...P(await z.text("xl/_rels/workbook.xml.rels")).getElementsByTagName("Relationship")].find((r) => r.getAttribute("Id") === rid);
    const t = rel.getAttribute("Target"); path = t.startsWith("/") ? t.slice(1) : "xl/" + t;
  } catch (e) {}
  const ss = []; const sst = await z.text("xl/sharedStrings.xml");
  if (sst) for (const si of P(sst).getElementsByTagName("si")) ss.push([...si.getElementsByTagName("t")].map((t) => t.textContent).join(""));
  const xml = await z.text(path); if (!xml) throw new Error("no_sheet");
  const rows = [];
  for (const r of P(xml).getElementsByTagName("row")) {
    const ri = (+r.getAttribute("r") || rows.length + 1) - 1, row = rows[ri] = [];
    for (const c of r.getElementsByTagName("c")) {
      const ref = c.getAttribute("r") || "", m = ref.match(/^([A-Z]+)/), t = c.getAttribute("t");
      let ci = row.length; if (m) { ci = 0; for (const ch of m[1]) ci = ci * 26 + ch.charCodeAt(0) - 64; ci--; }
      const v = c.getElementsByTagName("v")[0];
      row[ci] = t === "s" ? ss[+(v && v.textContent)] ?? "" : t === "inlineStr" ? [...c.getElementsByTagName("t")].map((x) => x.textContent).join("") : t === "b" ? (v && v.textContent === "1" ? "yes" : "no") : v ? v.textContent : "";
    }
  }
  return Array.from(rows, (r) => Array.from(r || [], (x) => (x == null ? "" : String(x))));
}

/* ---------- compare and preview ---------- */
function bkPlan(rows) {
  const head = (rows[0] || []).map((h) => String(h).trim().toLowerCase());
  const col = (re) => head.findIndex((h) => re.test(h));
  const C = { id: col(/^(ref|reference|id)\b/), p: col(/^price/), s: col(/^stock|^qty|^quantity/), on: col(/^online|^shown|^active/) };
  if (C.id < 0) return { fatal: 'The first row needs a "Ref" column. Use the file from "Download Excel" as the starting point.' };
  if (C.p < 0 && C.s < 0 && C.on < 0) return { fatal: 'No "Price", "Stock" or "Online" column was found in the first row.' };
  const byId = new Map(W.items.map((i) => [i.id, i])), seen = new Set(), changes = [], errors = []; let same = 0;
  rows.slice(1).forEach((r, k) => {
    const line = k + 2, id = String(r[C.id] ?? "").trim();
    if (!id && r.every((x) => !String(x ?? "").trim())) return;
    if (!id) return errors.push({ line, msg: "No ref" });
    const it = byId.get(id); if (!it) return errors.push({ line, id, msg: "No product with this ref" });
    if (seen.has(id)) return errors.push({ line, id, msg: "This ref appears twice; only the first row is used" });
    seen.add(id);
    const ch = {}; let bad = "";
    if (C.p >= 0) {
      const raw = String(r[C.p] ?? "").trim().replace(/^\$/, "").replace(/,(?=\d{3}\b)/g, "").replace(",", ".");
      const v = raw === "" ? 0 : Number(raw);
      if (!isFinite(v) || v < 0) bad = `Price "${r[C.p]}" is not a number`; else { const p = Math.round(v * 100) / 100; if (p !== (it.p || 0)) ch.p = [it.p || 0, p]; }
    }
    if (C.s >= 0 && !bad) {
      const raw = String(r[C.s] ?? "").trim(), v = raw === "" ? null : Number(raw);
      if (v !== null && (!isFinite(v) || v < 0 || Math.floor(v) !== v)) bad = `Stock "${r[C.s]}" must be a whole number (or empty)`; else if (v !== (it.s ?? null)) ch.s = [it.s ?? null, v];
    }
    if (C.on >= 0 && !bad) {
      const raw = String(r[C.on] ?? "").trim().toLowerCase();
      const v = /^(yes|y|1|true|on|نعم)$/.test(raw) ? 0 : /^(no|n|0|false|off|لا)$/.test(raw) ? 1 : raw === "" ? it.off : null;
      if (v === null) bad = `Online "${r[C.on]}" should be yes or no`; else if (v !== (it.off ? 1 : 0)) ch.off = [it.off ? 1 : 0, v];
    }
    if (bad) return errors.push({ line, id, msg: bad });
    if (Object.keys(ch).length) changes.push({ id, n: it.n, ch }); else same++;
  });
  return { changes, errors, same, missing: W.items.length - seen.size, cols: C };
}
const sv = (v) => (v == null ? '<span class="mu">empty</span>' : esc(v));
function bkPreview(plan, fname) {
  const m = document.createElement("div"); m.className = "mod"; m.id = "mod";
  const cnt = (k) => plan.changes.filter((c) => c.ch[k]).length;
  m.innerHTML = `<div class="box pfbox" role="dialog" aria-label="Check the changes"><div class="row"><h2 style="font-size:19px">Check the changes</h2><span class="mu sm">${esc(fname)}</span><span class="sp"></span><button class="btn" data-x>Cancel</button></div>`
    + (plan.fatal ? `<div class="notice bad">${esc(plan.fatal)}</div>` : `<div class="sum" style="margin:0"><button disabled><b>${plan.changes.length}</b><span>Products to update</span></button><button disabled><b>${cnt("p")}</b><span>Price changes</span></button><button disabled><b>${cnt("s")}</b><span>Stock changes</span></button><button disabled><b>${cnt("off")}</b><span>Online changes</span></button><button disabled class="${plan.errors.length ? "x" : ""}"><b>${plan.errors.length}</b><span>Rows with problems</span></button></div>
${plan.errors.length ? `<div class="notice bad"><b>These rows will be skipped:</b><ul style="margin:6px 0 0;padding-inline-start:18px">${plan.errors.slice(0, 50).map((e) => `<li>Row ${e.line}${e.id ? ` (${esc(e.id)})` : ""}: ${esc(e.msg)}</li>`).join("")}${plan.errors.length > 50 ? `<li>…and ${plan.errors.length - 50} more</li>` : ""}</ul></div>` : ""}
${plan.changes.length ? `<div class="tw" style="max-height:46vh;overflow:auto"><table><thead><tr><th>Ref</th><th>Name</th><th>Price ($)</th><th>Stock</th><th>Online</th></tr></thead><tbody>${plan.changes.map((c) => `<tr><td class="ref">${esc(c.id)}</td><td>${esc(c.n)}</td>${["p", "s", "off"].map((k) => `<td>${c.ch[k] ? (k === "off" ? `${c.ch[k][0] ? "no" : "yes"} → <b>${c.ch[k][1] ? "no" : "yes"}</b>` : `${sv(c.ch[k][0])} → <b>${sv(c.ch[k][1])}</b>`) : '<span class="mu">–</span>'}</td>`).join("")}</tr>`).join("")}</tbody></table></div>` : `<p class="mu" style="margin:0">Nothing to change: the file matches what is in the command center.</p>`}
<p class="mu sm" style="margin:0">${plan.same} ${plan.same === 1 ? "row is" : "rows are"} unchanged.${plan.missing ? ` ${plan.missing} products are not in the file and stay as they are.` : ""}${plan.cols.on < 0 ? ' The file has no "Online" column, so online status is not changed.' : ""}</p>
<div class="row"><span class="sp"></span><button class="btn pri" id="bkapply" ${plan.changes.length ? "" : "disabled"}>Apply ${plan.changes.length} ${plan.changes.length === 1 ? "change" : "changes"}</button></div>`) + `</div>`;
  document.body.appendChild(m);
  m.querySelector("[data-x]").onclick = () => m.remove();
  const ap = $("bkapply");
  if (ap) ap.onclick = () => {
    const byId = new Map(W.items.map((i) => [i.id, i]));
    plan.changes.forEach((c) => { const i = byId.get(c.id); if (c.ch.p) i.p = c.ch.p[1]; if (c.ch.s) i.s = c.ch.s[1]; if (c.ch.off) i.off = c.ch.off[1]; });
    m.remove(); render();
    toast(`${plan.changes.length} products updated here. Press "Publish changes" to put them live.`);
  };
}
async function bkUpload(file) {
  let rows;
  try {
    if (/\.xlsx$/i.test(file.name)) rows = await parseXlsx(await file.arrayBuffer());
    else if (/\.(csv|txt|tsv)$/i.test(file.name)) rows = parseCsv(await file.text());
    else return bkPreview({ fatal: "Please upload the .xlsx (Excel) or .csv file. Old .xls files: open them in Excel and save as .xlsx first." }, file.name);
  } catch (e) { return bkPreview({ fatal: "This file could not be read. Save it again in Excel as .xlsx (or .csv) and try again." }, file.name); }
  bkPreview(bkPlan(rows), file.name);
}
const stamp = () => new Date().toISOString().slice(0, 10);
document.addEventListener("click", (e) => {
  if (e.target.closest("#bkx")) bkSave(bkXlsx(), `oxinab-products-${stamp()}.xlsx`);
  if (e.target.closest("#bkc")) bkSave(bkCsv(), `oxinab-products-${stamp()}.csv`);
});
document.addEventListener("change", (e) => { if (e.target.id === "bkf") { const f = e.target.files[0]; e.target.value = ""; if (f) bkUpload(f); } });
