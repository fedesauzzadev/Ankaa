export function renderDashboardPage(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Findings dashboard · ApiGovScan</title>
<style>
:root {
  --paper: #faf8f3;
  --card: #ffffff;
  --ink: #23262b;
  --muted: #6b6f76;
  --line: #e8e2d4;
  --err-fg: #9c1f1f;
  --err-bg: #fbe9e7;
  --err-line: #efc5c0;
  --warn-fg: #7a5200;
  --warn-bg: #fff4d6;
  --warn-line: #ecd9a0;
  --info-fg: #1e40af;
  --info-bg: #e9f0fd;
  --info-line: #c3d4f5;
  --accent: #2f5d3a;
  --radius: 10px;
}
* { box-sizing: border-box; }
body {
  margin: 0;
  background: var(--paper);
  color: var(--ink);
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  line-height: 1.5;
}
header.top {
  position: sticky;
  top: 0;
  z-index: 5;
  background: var(--paper);
  border-bottom: 1px solid var(--line);
  padding: 14px 22px;
}
header.top h1 {
  margin: 0;
  font-size: 1.15rem;
  font-weight: 650;
  letter-spacing: 0.01em;
}
.score {
  display: inline-block;
  min-width: 3.2em;
  text-align: center;
  border-radius: 999px;
  padding: 1px 10px;
  font-variant-numeric: tabular-nums;
  font-weight: 700;
  border: 1px solid var(--line);
  background: var(--card);
}
.counts { color: var(--muted); font-variant-numeric: tabular-nums; }
.toolbar {
  position: sticky;
  top: 61px;
  z-index: 4;
  background: var(--paper);
  border-bottom: 1px solid var(--line);
  padding: 10px 22px;
  display: flex;
  flex-wrap: wrap;
  gap: 8px 14px;
  align-items: center;
}
.toolbar label { font-size: 0.85rem; color: var(--muted); }
.toolbar input[type="search"], .toolbar select, .toolbar input[type="text"] {
  font: inherit;
  font-size: 0.9rem;
  padding: 5px 9px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--card);
  color: var(--ink);
}
.toolbar input:focus-visible, .toolbar select:focus-visible, button:focus-visible {
  outline: 2px solid var(--info-fg);
  outline-offset: 1px;
}
main { padding: 16px 22px 60px; max-width: 1100px; }
.grouphead {
  margin: 22px 0 10px;
  font-size: 0.95rem;
  font-weight: 650;
}
.grouphead .n { color: var(--muted); font-variant-numeric: tabular-nums; font-weight: 400; }
.card {
  background: var(--card);
  border: 1px solid var(--line);
  border-left-width: 5px;
  border-radius: var(--radius);
  padding: 12px 16px;
  margin: 0 0 10px;
  max-width: 72ch;
}
.card.sev-error { border-left-color: var(--err-fg); }
.card.sev-warning { border-left-color: var(--warn-fg); }
.card.sev-info { border-left-color: var(--info-fg); }
.chip {
  display: inline-block;
  font-size: 0.75rem;
  font-weight: 700;
  border-radius: 999px;
  padding: 1px 9px;
  margin-right: 8px;
  border: 1px solid transparent;
  vertical-align: middle;
}
.chip.sev-error { color: var(--err-fg); background: var(--err-bg); border-color: var(--err-line); }
.chip.sev-warning { color: var(--warn-fg); background: var(--warn-bg); border-color: var(--warn-line); }
.chip.sev-info { color: var(--info-fg); background: var(--info-bg); border-color: var(--info-line); }
.rule { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.82rem; color: var(--muted); }
.msg { margin: 6px 0 4px; font-size: 0.98rem; line-height: 1.6; }
.api { font-size: 0.85rem; color: var(--muted); }
.loc { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.76rem; color: var(--muted); word-break: break-all; }
.fix { margin: 8px 0 0; font-size: 0.88rem; background: #f4f1e8; border-radius: 7px; padding: 7px 10px; line-height: 1.6; }
.src { font-size: 0.82rem; margin-top: 6px; }
.src a { color: var(--info-fg); }
.fp { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.74rem; color: var(--muted); }
.statusrow { margin-top: 9px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.statusrow button {
  font: inherit;
  font-size: 0.82rem;
  border: 1px solid var(--line);
  background: var(--paper);
  color: var(--ink);
  border-radius: 7px;
  padding: 3px 10px;
  cursor: pointer;
}
.statusrow button[aria-pressed="true"] { background: var(--ink); color: #fff; border-color: var(--ink); }
.llmrow { margin-top: 9px; display: flex; gap: 8px; align-items: center; flex-wrap: wrap; }
.llmrow button {
  font: inherit;
  font-size: 0.82rem;
  border: 1px dashed var(--info-fg);
  background: var(--info-bg);
  color: var(--info-fg);
  border-radius: 7px;
  padding: 3px 10px;
  cursor: pointer;
}
.note { font-size: 0.82rem; color: var(--muted); font-style: italic; }
.pager { margin: 18px 0; display: flex; gap: 10px; align-items: center; color: var(--muted); }
.pager button {
  font: inherit;
  font-size: 0.85rem;
  border: 1px solid var(--line);
  background: var(--card);
  border-radius: 7px;
  padding: 4px 12px;
  cursor: pointer;
}
.empty { color: var(--muted); padding: 30px 0; }
.legend { font-size: 0.82rem; color: var(--muted); margin-top: 6px; max-width: 100ch; }
.legend code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.76rem; }
details.glossary { margin: 10px 22px 0; max-width: 1100px; font-size: 0.85rem; color: var(--muted); }
details.glossary summary { cursor: pointer; color: var(--ink); font-weight: 600; }
details.glossary table { border-collapse: collapse; margin-top: 8px; font-size: 0.82rem; }
details.glossary th, details.glossary td { border: 1px solid var(--line); padding: 4px 8px; text-align: left; }
details.glossary th { background: var(--card); }
.hint { font-size: 0.78rem; color: var(--muted); display: block; margin-top: 2px; }
.kv { font-size: 0.82rem; color: var(--muted); margin: 6px 0 2px; }
.kv b { color: var(--ink); font-weight: 600; }
.meta { font-size: 0.78rem; color: var(--muted); margin-top: 4px; }
</style>
</head>
<body>
<header class="top">
  <h1>Findings dashboard <span class="score" id="score" title="Governance score: 100 minus penalties (8 per error, 3 per warning, 1 per info). Grades: A ≥90, B ≥75, C ≥60, D ≥40, F <40.">–</span></h1>
  <div class="counts" id="summary">Loading report…</div>
  <div class="legend" id="scorelegend">Score = 100 − (8 × errors + 3 × warnings + 1 × info), floor 0. Grades: A ≥90 · B ≥75 · C ≥60 · D ≥40 · F &lt;40. Severity: error = breaks compatibility / security / spec validity · warning = proven integration pain · info = style preference.</div>
</header>
<details class="glossary">
  <summary>Rule dictionary — what do AUTH-001, ERR-005… mean?</summary>
  <div>Each id is <code>PREFIX-NNN</code>: the prefix is the governance domain, the number is the rule. Severity is calibrated by evidence, not by how scary the name sounds.</div>
  <table>
    <tr><th>Prefix</th><th>Domain</th><th>Example</th></tr>
    <tr><td>AUTH-</td><td>securitySchemes, public operations</td><td>AUTH-001: declare global or per-operation security</td></tr>
    <tr><td>ERR-</td><td>error responses, problem+json, 4xx/5xx</td><td>ERR-005 (warning): public APIs should document a 5xx response — advisory, not a crash</td></tr>
    <tr><td>STRUCT-</td><td>spec structure (openapi, info, servers)</td><td>STRUCT-001: openapi version present</td></tr>
    <tr><td>NAMING-</td><td>paths, fields, operationId, headers</td><td>NAMING-001: plural nouns for resource paths</td></tr>
    <tr><td>DOCS-</td><td>summary, description, examples, tags</td><td>DOCS-001: operation description</td></tr>
    <tr><td>PARAM-</td><td>parameters (query, path, headers)</td><td>PARAM-003: camelCase query names</td></tr>
    <tr><td>SCHEMA-</td><td>models, components, reuse</td><td>SCHEMA-002: avoid deep inline objects</td></tr>
    <tr><td>RESP-</td><td>responses, status codes</td><td>RESP-001: 2xx documented</td></tr>
    <tr><td>PAG-</td><td>pagination and collections</td><td>PAG-001: page/cursor style</td></tr>
    <tr><td>VER- / DEPR-</td><td>versioning, servers, deprecation / sunset</td><td>VER-001: consistent versioning</td></tr>
    <tr><td>CONS-</td><td>cross-cutting consistency</td><td>CONS-004: consistent enum casing</td></tr>
    <tr><td>SEC-</td><td>sensitive data in examples, TLS servers</td><td>SEC-003: examples free of secrets</td></tr>
    <tr><td>PERF-</td><td>hints (select, $ref depth, size)</td><td>PERF-001: oversized spec</td></tr>
  </table>
  <div>Each card also cites its source guideline with a link. Filter by rule id (e.g. ERR-) to see a whole family.</div>
</details>
<div class="toolbar" role="search">
  <label>Search <input type="search" id="q" placeholder="Filter text" autocomplete="off"></label>
  <label>Severity
    <select id="sev">
      <option value="">All severities</option>
      <option value="error">Errors</option>
      <option value="warning">Warnings</option>
      <option value="info">Info</option>
    </select>
  </label>
  <label title="A pack is a versioned rule set. elite = curated OpenAPI design guidelines; graphql/grpc/asyncapi/webhooks = protocol-specific packs. This report only contains the packs listed here.">Pack <select id="pack"><option value="">All packs</option></select><span class="hint" id="packhint"></span></label>
  <label title="Owner groups come from --group-by owners.yaml (input path to team name). Without it every finding is 'ungrouped'.">Owner group <select id="owner"><option value="">All groups</option></select><span class="hint" id="ownerhint"></span></label>
  <label>Rule <input type="text" id="rule" placeholder="Rule id" autocomplete="off"></label>
  <label>Trend
    <select id="trend">
      <option value="">New and repeated</option>
      <option value="new">New only</option>
      <option value="repeated">Repeated only</option>
    </select>
  </label>
  <label>Status
    <select id="tstatus">
      <option value="">Any status</option>
      <option value="pending">Pending</option>
      <option value="in_progress">In progress</option>
      <option value="resolved">Resolved</option>
    </select>
  </label>
  <label>Group by
    <select id="groupby">
      <option value="none">No grouping</option>
      <option value="pack">Pack</option>
      <option value="owner">Owner group</option>
      <option value="rule">Rule</option>
      <option value="file">Spec file</option>
      <option value="severity">Severity</option>
      <option value="trend">Trend</option>
      <option value="status">Tracking status</option>
    </select>
  </label>
</div>
<main id="list"></main>
<script>
(function () {
  "use strict";
  var state = { report: null, tracking: { version: 1, states: {} }, groups: {}, trends: null, page: 0, reportFile: "report.json" };
  var PER_PAGE = 100;

  function esc(s) {
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c];
    });
  }
  function $(id) { return document.getElementById(id); }
  function debounce(fn, ms) {
    var t = 0;
    return function () {
      window.clearTimeout(t);
      var self = this, args = arguments;
      t = window.setTimeout(function () { fn.apply(self, args); }, ms);
    };
  }
  function baseName(p) { return String(p || "").split(/[\\\\/]/).pop(); }
  function ownerOf(f) {
    var g = state.groups || {};
    var loc = String(f.location || "");
    var candidates = [];
    var split = loc.indexOf("##");
    if (split >= 0) candidates.push(loc.slice(0, split));
    for (var key in g) {
      if (Object.prototype.hasOwnProperty.call(g, key)) {
        if (loc === key || loc.indexOf(key + "#") === 0 || loc.indexOf(key + "/") === 0) candidates.push(key);
      }
    }
    var inputs = state.report.input || [];
    if (inputs.length === 1 && inputs[0]) candidates.push(inputs[0].path);
    for (var i = 0; i < candidates.length; i++) {
      var c = candidates[i] || "";
      if (g[c]) return g[c];
      var b = baseName(c);
      if (g[b]) return g[b];
    }
    return "ungrouped";
  }
  function trendOf(f) {
    if (!state.trends) return "";
    return state.trends.byFingerprint[f.fingerprint] || "";
  }
  function statusOf(f) {
    var s = state.tracking.states[f.fingerprint];
    return s ? s.status : "pending";
  }
  function filtered() {
    var q = $("q").value.toLowerCase();
    var sev = $("sev").value, pack = $("pack").value, owner = $("owner").value;
    var rule = $("rule").value.toLowerCase(), trend = $("trend").value, tst = $("tstatus").value;
    return state.report.findings.filter(function (f) {
      if (sev && f.severity !== sev) return false;
      if (pack && f.packId !== pack) return false;
      if (owner && ownerOf(f) !== owner) return false;
      if (rule && String(f.ruleId || "").toLowerCase().indexOf(rule) < 0) return false;
      if (trend && trendOf(f) !== trend) return false;
      if (tst && statusOf(f) !== tst) return false;
      if (q) {
        var hay = [f.message, f.ruleId, f.apiLocation, f.location, f.fix].join(" ").toLowerCase();
        if (hay.indexOf(q) < 0) return false;
      }
      return true;
    });
  }
  function groupKey(f, mode) {
    switch (mode) {
      case "pack": return f.packId || "unknown";
      case "owner": return ownerOf(f);
      case "rule": return f.ruleId;
      case "file": return baseName(inputPath(f.location));
      case "severity": return f.severity;
      case "trend": return trendOf(f) || "unknown";
      case "status": return statusOf(f);
      default: return "";
    }
  }
  var SEV_HELP = {
    error: "error: breaks compatibility, security or spec validity — fix first",
    warning: "warning: proven integration pain (undocumented errors, missing operationId…) — fix next",
    info: "info: style preference from the guideline — polish when convenient"
  };
  function card(f) {
    var st = statusOf(f);
    var src = f.source ? '<div class="src">Source: ' + esc(f.source.title) + (f.source.section ? " · " + esc(f.source.section) : "") + ' — <a href="' + esc(f.source.url) + '" target="_blank" rel="noreferrer">' + esc(f.source.url) + "</a></div>" : "";
    var fix = f.fix ? '<p class="fix"><b>How to fix:</b> ' + esc(f.fix) + "</p>" : "";
    var note = (state.tracking.states[f.fingerprint] || {}).note;
    var noteHtml = note ? '<span class="note">' + esc(note) + "</span>" : "";
    var trend = trendOf(f);
    var trendHtml = trend ? ' <span class="rule">' + esc(trend) + "</span>" : "";
    var sevTitle = SEV_HELP[f.severity] || f.severity;
    var where = (f.apiLocation ? '<div class="kv"><b>Where it fails (endpoint):</b> ' + esc(f.apiLocation) + "</div>" : "") +
      '<div class="kv"><b>Where it fails (spec pointer):</b> <span class="loc">' + esc(f.location) + "</span></div>" +
      '<div class="meta">Open the spec file above and follow the pointer after ## (JSON pointer into the YAML/JSON).</div>';
    var meta = '<div class="meta">Category ' + esc(f.category || "n/a") + " · pack " + esc(f.packId || "unknown") + (f.packVersion ? " " + esc(f.packVersion) : "") + "</div>";
    return '<article class="card sev-' + esc(f.severity) + '">' +
      '<span class="chip sev-' + esc(f.severity) + '" title="' + esc(sevTitle) + '">' + esc(f.severity) + "</span>" +
      '<span class="rule" title="Rule id: domain prefix + number. See the rule dictionary at the top.">' + esc(f.ruleId) + "</span>" + trendHtml + meta +
      '<p class="msg">' + esc(f.message) + "</p>" + where + fix + src +
      '<div class="fp">fingerprint ' + esc(String(f.fingerprint).slice(0, 12)) + "…</div>" +
      '<div class="llmrow"><button class="copyllm" data-fp="' + esc(f.fingerprint) + '" title="Copy a ready-to-paste prompt for any LLM with this finding\u2019s rule, location and fix hint. No spec content is included — only metadata and pointers.">Copy prompt for LLM</button>' +
      '<button class="copyfix" data-fp="' + esc(f.fingerprint) + '" data-loc="' + esc(f.location) + '" title="Copy the terminal command that asks your configured LLM for a patch draft of this finding (needs llm.baseUrl in apigovscan.yaml).">Copy fix command</button>' +
      '<button class="copysuppress" data-fp="' + esc(f.fingerprint) + '" title="Copy the terminal command that records this finding as false-positive/wontfix with your reason (no hand-written JSON). Paste it in your terminal and set --decision/--reason.">Copy suppress command</button></div>' +
      '<div class="statusrow" data-fp="' + esc(f.fingerprint) + '">' +
      ["pending", "in_progress", "resolved"].map(function (s) {
        var label = s === "in_progress" ? "In progress" : s.charAt(0).toUpperCase() + s.slice(1);
        return '<button data-status="' + s + '" aria-pressed="' + (st === s) + '">' + label + "</button>";
      }).join("") + noteHtml + "</div></article>";
  }
  function render() {
    var list = $("list");
    var items = filtered();
    var mode = $("groupby").value;
    var pages = Math.max(1, Math.ceil(items.length / PER_PAGE));
    if (state.page >= pages) state.page = pages - 1;
    var slice = items.slice(state.page * PER_PAGE, state.page * PER_PAGE + PER_PAGE);
    var html = "";
    if (mode === "none") {
      html = slice.map(card).join("");
    } else {
      var last = null, buf = "", count = 0;
      var groups = [];
      slice.forEach(function (f) {
        var k = groupKey(f, mode);
        if (k !== last) { if (buf) groups.push({ k: last, html: buf, n: count }); last = k; buf = ""; count = 0; }
        buf += card(f); count++;
      });
      if (buf) groups.push({ k: last, html: buf, n: count });
      html = groups.map(function (g) {
        return '<h2 class="grouphead">' + esc(g.k) + ' <span class="n">' + g.n + " shown</span></h2>" + g.html;
      }).join("");
    }
    if (!items.length) html = '<p class="empty">No findings match the current filters. Tip: this report has zero errors — try “All severities” or the disaster-report (7 errors) for an error example.</p>';
    if (pages > 1) {
      html += '<div class="pager"><button id="prev">Previous</button><span>Page ' + (state.page + 1) + " of " + pages + " · " + items.length + " findings</span>" + '<button id="next">Next</button></div>';
    } else {
      html += '<div class="pager"><span>' + items.length + " findings · single page (pagination appears above 100 findings)</span></div>";
    }
    list.innerHTML = html;
    var prev = $("prev"), next = $("next");
    if (prev) prev.onclick = function () { if (state.page > 0) { state.page--; render(); } };
    if (next) next.onclick = function () { if (state.page < pages - 1) { state.page++; render(); } };
    list.querySelectorAll(".copyllm").forEach(function (btn) {
      btn.onclick = function () { copyPrompt(btn.getAttribute("data-fp"), btn); };
    });
    list.querySelectorAll(".copyfix").forEach(function (btn) {
      btn.onclick = function () { copyFixCommand(btn.getAttribute("data-fp"), btn.getAttribute("data-loc"), btn); };
    });
    list.querySelectorAll(".copysuppress").forEach(function (btn) {
      btn.onclick = function () { copySuppressCommand(btn.getAttribute("data-fp"), btn); };
    });
    list.querySelectorAll(".statusrow").forEach(function (row) {
      row.querySelectorAll("button").forEach(function (btn) {
        btn.onclick = function () { setStatus(row.getAttribute("data-fp"), btn.getAttribute("data-status")); };
      });
    });
  }
  function promptText(f) {
    var lines = [
      "Help me fix an API governance finding reported by ApiGovScan.",
      "",
      "Rule: " + f.ruleId + " [severity: " + f.severity + ", category: " + (f.category || "n/a") + ", pack: " + (f.packId || "unknown") + (f.packVersion ? " " + f.packVersion : "") + "]",
      "Message: " + f.message
    ];
    if (f.fix) lines.push("Fix hint: " + f.fix);
    if (f.examples && f.examples.bad) lines.push("Bad example:\n" + f.examples.bad);
    if (f.examples && f.examples.good) lines.push("Good example:\n" + f.examples.good);
    if (f.apiLocation) lines.push("Endpoint: " + f.apiLocation);
    lines.push("Spec pointer: " + f.location);
    if (f.source) lines.push("Source: " + f.source.title + (f.source.section ? " — " + f.source.section : "") + " (" + f.source.url + ")");
    lines.push(
      "",
      "Propose the smallest YAML/JSON edit to the spec file at that pointer that resolves the finding.",
      "Reply with a unified diff plus a one-line explanation.",
      "Note: I have NOT pasted the spec content — only metadata and pointers. Ask me for the snippet around the pointer if you need it."
    );
    return lines.join("\n");
  }
  function fallbackCopy(text, done) {
    try {
      var ta = document.createElement("textarea");
      ta.value = text;
      ta.setAttribute("readonly", "");
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      var ok = document.execCommand("copy");
      document.body.removeChild(ta);
      done(!!ok);
    } catch (e) { done(false); }
  }
  function flash(btn, ok, okMsg) {
    var old = btn.textContent;
    btn.textContent = ok ? okMsg : "Copy failed — select the card text manually";
    window.setTimeout(function () { btn.textContent = old; }, 1800);
  }
  function copyText(text, done) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () { done(true); }, function () { fallbackCopy(text, done); });
    } else {
      fallbackCopy(text, done);
    }
  }
  function copyPrompt(fp, btn) {
    var found = null;
    state.report.findings.forEach(function (f) { if (f.fingerprint === fp) found = f; });
    if (!found) return;
    copyText(promptText(found), function (ok) { flash(btn, ok, "Copied — paste it into any LLM"); });
  }
  function copySuppressCommand(fp, btn) {
    var report = state.reportFile || "report.json";
    var cmd = 'apigovscan suppress --report "' + report + '" --fingerprint ' + String(fp).slice(0, 12) +
      ' --decision wontfix --reason "why this stays as-is"';
    copyText(cmd, function (ok) { flash(btn, ok, "Copied — set --decision/--reason in your terminal"); });
  }
  function copyFixCommand(fp, loc, btn) {
    var hash = String(loc || "").indexOf("#");
    var file = hash >= 0 ? String(loc).slice(0, hash) : String(loc || "");
    if (!file) file = (state.report.input && state.report.input[0] && state.report.input[0].path) || "spec.yaml";
    var cmd = 'apigovscan fix "' + file + '" --fingerprint ' + String(fp).slice(0, 12);
    copyText(cmd, function (ok) { flash(btn, ok, "Copied — paste it in your terminal"); });
  }
  function setStatus(fp, status) {
    fetch("api/tracking", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ fingerprint: fp, status: status })
    }).then(function (r) { return r.json(); }).then(function (body) {
      if (body && body.ok) { state.tracking = body.tracking; render(); }
    }).catch(function () {});
  }
  function fillSelect(id, values) {
    var el = $(id), cur = el.value;
    while (el.options.length > 1) el.remove(1);
    values.forEach(function (v) {
      var o = document.createElement("option");
      o.value = v; o.textContent = v;
      el.appendChild(o);
    });
    el.value = cur;
  }
  function boot(data) {
    state.report = data.report;
    state.reportFile = data.reportFile || "report.json";
    state.tracking = data.tracking || state.tracking;
    state.groups = data.groups || {};
    state.trends = data.trends || null;
    var r = data.report;
    var packs = [], owners = {};
    r.findings.forEach(function (f) {
      if (packs.indexOf(f.packId) < 0) packs.push(f.packId);
      owners[ownerOf(f)] = true;
    });
    fillSelect("pack", packs.sort());
    fillSelect("owner", Object.keys(owners).sort());
    var packHint = $("packhint");
    if (packHint) packHint.textContent = packs.length <= 1
      ? "This report only uses the “" + (packs[0] || "elite") + "” rule set (curated OpenAPI guidelines)."
      : "This report mixes " + packs.length + " rule sets (one per protocol).";
    var ownerHint = $("ownerhint");
    if (ownerHint) {
      var keys = Object.keys(owners);
      ownerHint.textContent = (keys.length <= 1 && keys[0] === "ungrouped")
        ? "No owner file passed — everything is “ungrouped”. Re-run with --group-by owners.yaml to group by team."
        : "Groups come from --group-by owners.yaml.";
    }
    var s = r.summary || {};
    var cov = r.coverage;
    var covText = (cov && typeof cov.pct === "number")
      ? " · coverage " + cov.pct + "% (" + cov.inspected + "/" + cov.total + " nodes)"
      : "";
    $("summary").textContent = (r.input ? r.input.length : 0) + " specs · " +
      (s.error || 0) + " errors · " + (s.warning || 0) + " warnings · " + (s.info || 0) + " info" + covText;
    if (cov && cov.byClass) {
      var parts = Object.keys(cov.byClass).sort().map(function (k) {
        var c = cov.byClass[k]; return k + " " + c.inspected + "/" + c.total;
      });
      $("summary").title = "Nodes inspected by at least one active rule (static approximation): " + parts.join(", ");
      var leg = $("scorelegend");
      if (leg) leg.textContent += " Coverage = % of spec nodes inspected by at least one active rule; hover the summary line for the per-class breakdown.";
    }
    var sc = r.score;
    $("score").textContent = sc ? ("score " + sc.value + " (" + sc.grade + ")") : "no score";
    ["q", "rule"].forEach(function (id) {
      $(id).addEventListener("input", debounce(function () { state.page = 0; render(); }, 150));
    });
    ["sev", "pack", "owner", "trend", "tstatus", "groupby"].forEach(function (id) {
      $(id).addEventListener("change", function () { state.page = 0; render(); });
    });
    render();
  }
  fetch("api/report").then(function (r) { return r.json(); }).then(boot).catch(function () {
    $("summary").textContent = "Could not load the report.";
  });
})();
</script>
</body>
</html>`;
}
