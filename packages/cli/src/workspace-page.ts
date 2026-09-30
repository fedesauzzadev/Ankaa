export function renderWorkspacePage(token: string): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>ApiGovScan workspace</title>
<style>
  :root { color-scheme: light dark; }
  * { box-sizing: border-box; }
  body { font-family: system-ui, sans-serif; margin: 0; background: #f6f6f8; color: #1c1c22; }
  header { display: flex; gap: 1rem; align-items: baseline; padding: .8rem 1.2rem; background: #241c3a; color: #fff; flex-wrap: wrap; }
  header h1 { font-size: 1.05rem; margin: 0; }
  nav { display: flex; gap: .25rem; flex-wrap: wrap; }
  nav button { border: 0; background: transparent; color: #d9d2f0; padding: .35rem .7rem; border-radius: 999px; cursor: pointer; font: inherit; }
  nav button[aria-current="page"] { background: #5b4a97; color: #fff; }
  nav button.upcoming::after { content: " (soon)"; opacity: .7; font-size: .75em; }
  main { max-width: 60rem; margin: 0 auto; padding: 1.2rem; }
  section[hidden] { display: none; }
  .card { background: #fff; border: 1px solid #ddd9e8; border-radius: 10px; padding: 1rem 1.2rem; margin-bottom: 1rem; }
  .card h2 { margin: 0 0 .6rem; font-size: 1rem; }
  label { display: block; font-weight: 600; margin: .6rem 0 .2rem; }
  input, select { width: 100%; max-width: 28rem; padding: .45rem .6rem; border: 1px solid #c9c4dd; border-radius: 6px; font: inherit; background: inherit; color: inherit; }
  button.primary { background: #5b4a97; border: 0; color: #fff; padding: .55rem 1.1rem; border-radius: 8px; cursor: pointer; font: inherit; margin-top: .8rem; }
  button.primary:disabled { opacity: .5; cursor: default; }
  .hint { color: #6b6584; font-size: .85rem; }
  .status { padding: .5rem .8rem; border-radius: 8px; font-weight: 600; display: inline-block; }
  .status.running { background: #e8e2ff; }
  .status.succeeded { background: #dcf5e4; }
  .status.failed, .status.cancelled { background: #fde3e3; }
  .mono { font-family: ui-monospace, monospace; font-size: .85rem; }
  table { border-collapse: collapse; width: 100%; font-size: .85rem; }
  th, td { text-align: left; padding: .35rem .5rem; border-bottom: 1px solid #eeeaf6; vertical-align: top; }
  .sev-error { color: #b3261e; font-weight: 700; }
  .sev-warning { color: #9a6700; font-weight: 700; }
  .sev-info { color: #4263c6; font-weight: 700; }
  ul.clean { margin: 0; padding-left: 1.1rem; }
  .err { color: #b3261e; }
  @media (prefers-color-scheme: dark) {
    body { background: #14131a; color: #e8e6f0; }
    .card { background: #1d1b26; border-color: #322d4a; }
    input, select { border-color: #453f66; }
    .status.running { background: #322a5c; }
    .status.succeeded { background: #1d4430; }
    .status.failed, .status.cancelled { background: #522222; }
    th, td { border-color: #2c2842; }
    .err { color: #ff8a80; }
  }
</style>
</head>
<body>
<header>
  <h1>ApiGovScan workspace</h1>
  <nav aria-label="Sections">
    <button data-view="home" aria-current="page">Home</button>
    <button data-view="new">New analysis</button>
    <button data-view="progress">Progress</button>
    <button data-view="result">Results</button>
    <button data-view="compare" id="nav-compare">Compare</button>
    <button data-view="ci" class="upcoming" disabled>Prepare CI</button>
  </nav>
</header>
<main>
  <section id="home">
    <div class="card">
      <h2>Guided operations</h2>
      <div id="catalog"><p class="hint">Loading catalog…</p></div>
    </div>
    <div class="card">
      <h2>Notes</h2>
      <ul class="clean">
        <li>Everything runs locally on your machine; specs never leave it.</li>
        <li>Paths are analyzed exactly as you type them; nothing is written unless you ask for it.</li>
        <li>Mutations carry a per-process token served only to this page.</li>
      </ul>
    </div>
  </section>

  <section id="new" hidden>
    <div class="card">
      <h2>New analysis</h2>
      <form id="start-form">
        <label for="path">Spec file or directory</label>
        <input id="path" name="path" autocomplete="off" spellcheck="false" placeholder="specs/ or openapi.yaml" required>
        <p class="hint">Local path, relative to where the workspace was started.</p>
        <label for="failon">Fail threshold</label>
        <select id="failon">
          <option value="error">error</option>
          <option value="warning">warning</option>
          <option value="info">info</option>
          <option value="never">never</option>
        </select>
        <p class="hint">The threshold only affects the gate flag; the report is identical.</p>
        <button class="primary" id="start-btn" type="submit">Start analysis</button>
      </form>
    </div>
  </section>

  <section id="progress" hidden>
    <div class="card">
      <h2>Progress</h2>
      <p id="prog-state"><span class="hint">No run yet.</span></p>
      <button class="primary" id="cancel-btn" type="button">Cancel run</button>
    </div>
  </section>

  <section id="result" hidden>
    <div class="card">
      <h2>Results</h2>
      <div id="result-body"><p class="hint">No result yet.</p></div>
    </div>
    <div class="card">
      <h2>Run history</h2>
      <div id="history"><p class="hint">Loading history…</p></div>
    </div>
  </section>

  <section id="compare" hidden>
    <div class="card">
      <h2>Compare two runs</h2>
      <label for="cmp-left">Baseline run (left)</label>
      <select id="cmp-left"></select>
      <label for="cmp-right">Current run (right)</label>
      <select id="cmp-right"></select>
      <p class="hint">Only succeeded runs over the same inputs can be compared.</p>
      <button class="primary" id="cmp-btn" type="button">Compare runs</button>
      <div id="cmp-body"></div>
    </div>
  </section>

  <section id="ci" hidden>
    <div class="card"><h2>Prepare CI</h2><p class="hint">Coming in an upcoming milestone.</p></div>
  </section>
</main>
<script>
(function () {
  "use strict";
  var TOKEN = ${JSON.stringify(token)};
  var pollTimer = null;

  function el(id) { return document.getElementById(id); }
  function clear(node) { while (node.firstChild) node.removeChild(node.firstChild); }
  function text(node, value) { var t = document.createTextNode(String(value)); clear(node); node.appendChild(t); }

  function view(name) {
    var buttons = document.querySelectorAll("nav button[data-view]");
    for (var i = 0; i < buttons.length; i++) {
      var b = buttons[i];
      if (b.getAttribute("data-view") === name) b.setAttribute("aria-current", "page");
      else b.removeAttribute("aria-current");
    }
    var sections = document.querySelectorAll("main section");
    for (var j = 0; j < sections.length; j++) {
      sections[j].hidden = sections[j].id !== name;
    }
    if (name === "progress") startPolling(); else stopPolling();
    if (name === "result") { loadResult(); loadHistory(); }
    if (name === "compare") loadCompareOptions();
  }

  function api(path, options) {
    var init = { headers: { "x-apigovscan-token": TOKEN } };
    if (options && options.method) init.method = options.method;
    if (options && options.body) init.body = JSON.stringify(options.body);
    return fetch(path, init).then(function (res) {
      return res.json().then(function (payload) { return { status: res.status, payload: payload }; });
    });
  }

  function loadCatalog() {
    api("/api/catalog").then(function (res) {
      var box = el("catalog");
      clear(box);
      if (!res.payload || res.payload.ok !== true) { text(box, "Catalog unavailable."); return; }
      var ops = res.payload.operations || [];
      for (var i = 0; i < ops.length; i++) {
        var card = document.createElement("div");
        card.className = "card";
        var h = document.createElement("h3"); h.textContent = ops[i].title; card.appendChild(h);
        var p = document.createElement("p"); p.textContent = ops[i].description; card.appendChild(p);
        var dl = document.createElement("ul"); dl.className = "clean";
        var fields = [["Inputs", ops[i].inputs], ["Output", [ops[i].output]], ["Errors", ops[i].errors], ["Writes", ops[i].writes], ["Network", [ops[i].network ? "yes" : "no"]]];
        for (var f = 0; f < fields.length; f++) {
          var li = document.createElement("li");
          var b = document.createElement("strong"); b.textContent = fields[f][0] + ": ";
          li.appendChild(b); li.appendChild(document.createTextNode(fields[f][1].join(" ")));
          dl.appendChild(li);
        }
        card.appendChild(dl);
        box.appendChild(card);
      }
      var up = res.payload.upcoming || [];
      if (up.length > 0) {
        var note = document.createElement("p"); note.className = "hint";
        note.textContent = "Upcoming in later milestones: " + up.join(", ") + ".";
        box.appendChild(note);
      }
    });
  }

  function renderState(run) {
    var box = el("prog-state");
    clear(box);
    if (!run) { text(box, "No run yet."); el("cancel-btn").disabled = true; return; }
    var badge = document.createElement("span");
    badge.className = "status " + run.state; badge.textContent = run.state;
    box.appendChild(badge);
    box.appendChild(document.createTextNode(" " + run.operation + " · " + run.id));
    if (run.phase) {
      var line = document.createElement("div");
      line.className = "mono";
      var counters = (typeof run.completed === "number" && typeof run.total === "number") ? (" (" + run.completed + "/" + run.total + ")") : "";
      line.textContent = run.phase + counters + (run.item ? " · " + run.item : "");
      box.appendChild(line);
    }
    if (run.error) { var e = document.createElement("div"); e.className = "err mono"; e.textContent = run.error; box.appendChild(e); }
    el("cancel-btn").disabled = run.state !== "running";
  }

  function startPolling() {
    stopPolling();
    pollTimer = setInterval(function () {
      api("/api/state").then(function (res) {
        renderState(res.payload && res.payload.run);
      });
    }, 400);
  }
  function stopPolling() { if (pollTimer !== null) { clearInterval(pollTimer); pollTimer = null; } }

  function loadResult() {
    api("/api/result").then(function (res) {
      var box = el("result-body");
      var payload = res.payload || {};
      if (payload.ok !== true) { text(box, payload.error || "No result yet."); return; }
      var report = payload.report || {};
      renderReportInto(box, report, "current run", "succeeded", undefined);
    });
  }

  el("start-form").addEventListener("submit", function (event) {
    event.preventDefault();
    var btn = el("start-btn"); btn.disabled = true;
    api("/api/analyze/start", { method: "POST", body: { path: el("path").value.trim(), failOn: el("failon").value } })
      .then(function (res) {
        if (res.payload && res.payload.ok === true) { view("progress"); }
        else { alert((res.payload && res.payload.error) || "Could not start the analysis."); }
      })
      .finally(function () { btn.disabled = false; });
  });

  el("cancel-btn").addEventListener("click", function () {
    api("/api/analyze/cancel", { method: "POST" }).then(function (res) {
      if (res.payload && res.payload.ok !== true) { alert((res.payload && res.payload.error) || "Nothing to cancel."); }
    });
  });

  var navButtons = document.querySelectorAll("nav button[data-view]");
  for (var i = 0; i < navButtons.length; i++) {
    (function (button) {
      button.addEventListener("click", function () { view(button.getAttribute("data-view")); });
    })(navButtons[i]);
  }

  function loadHistory() {
    api("/api/runs").then(function (res) {
      var box = el("history");
      clear(box);
      var payload = res.payload || {};
      if (payload.ok !== true) { text(box, payload.error || "History unavailable."); return; }
      var runs = payload.runs || [];
      if (runs.length === 0) { text(box, "No runs yet. Start an analysis to build history."); return; }
      if (payload.invalidFiles > 0) {
        var warn = document.createElement("p"); warn.className = "hint";
        warn.textContent = payload.invalidFiles + " unreadable run file(s) were skipped.";
        box.appendChild(warn);
      }
      var table = document.createElement("table");
      var thead = document.createElement("thead");
      var hr = document.createElement("tr");
      ["run", "state", "source", "started", "findings", ""].forEach(function (h) {
        var th = document.createElement("th"); th.textContent = h; hr.appendChild(th);
      });
      thead.appendChild(hr); table.appendChild(thead);
      var tbody = document.createElement("tbody");
      runs.forEach(function (run) {
        var tr = document.createElement("tr");
        var idd = document.createElement("td"); idd.className = "mono"; idd.textContent = run.id;
        var std = document.createElement("td");
        var badge = document.createElement("span"); badge.className = "status " + run.state; badge.textContent = run.state;
        std.appendChild(badge);
        var srcd = document.createElement("td"); srcd.className = "mono"; srcd.textContent = run.source;
        var whend = document.createElement("td"); whend.className = "mono"; whend.textContent = run.startedAt;
        var find = document.createElement("td");
        find.textContent = run.summary ? (run.summary.total + " (" + run.summary.error + " err)") : "—";
        var opend = document.createElement("td");
        var btn = document.createElement("button"); btn.type = "button"; btn.textContent = "Open";
        (function (runId) {
          btn.addEventListener("click", function () { openRun(runId); });
        })(run.id);
        opend.appendChild(btn);
        tr.appendChild(idd); tr.appendChild(std); tr.appendChild(srcd); tr.appendChild(whend); tr.appendChild(find); tr.appendChild(opend);
        tbody.appendChild(tr);
      });
      table.appendChild(tbody); box.appendChild(table);
    });
  }

  function openRun(runId) {
    api("/api/runs/" + encodeURIComponent(runId)).then(function (res) {
      var box = el("result-body");
      clear(box);
      var payload = res.payload || {};
      if (payload.ok !== true) { text(box, payload.error || "Run unavailable."); return; }
      renderReportInto(box, payload.run.report, payload.run.id, payload.run.state, payload.run.error);
    });
  }

  function renderReportInto(box, report, runId, runState, runError) {
    clear(box);
    var head = document.createElement("p");
    head.textContent = "run " + runId + " · " + runState;
    box.appendChild(head);
    if (runError) { var e = document.createElement("p"); e.className = "err mono"; e.textContent = runError; box.appendChild(e); }
    if (!report) {
      var none = document.createElement("p"); none.className = "hint";
      none.textContent = "This run produced no report.";
      box.appendChild(none); return;
    }
    var summary = report.summary || { error: 0, warning: 0, info: 0, total: 0 };
    var counts = document.createElement("p");
    var score = report.score ? (" · score " + report.score.value + " (" + report.score.grade + ")") : "";
    counts.textContent = summary.error + " errors · " + summary.warning + " warnings · " + summary.info + " info" + score;
    box.appendChild(counts);
    var hash = document.createElement("p"); hash.className = "mono hint"; hash.textContent = "reportHash " + (report.reportHash || "");
    box.appendChild(hash);
    var inputs = document.createElement("p"); inputs.className = "mono hint";
    inputs.textContent = "inputs: " + (report.input || []).map(function (i) { return i.path; }).join(", ");
    box.appendChild(inputs);
    var findings = report.findings || [];
    if (findings.length === 0) { var ok = document.createElement("p"); ok.textContent = "No findings."; box.appendChild(ok); return; }
    var table = document.createElement("table");
    var thead = document.createElement("thead");
    var hr = document.createElement("tr");
    ["severity", "rule", "location", "message"].forEach(function (h) {
      var th = document.createElement("th"); th.textContent = h; hr.appendChild(th);
    });
    thead.appendChild(hr); table.appendChild(thead);
    var tbody = document.createElement("tbody");
    findings.slice(0, 50).forEach(function (f) {
      var tr = document.createElement("tr");
      var sevd = document.createElement("td"); sevd.className = "sev-" + f.severity; sevd.textContent = f.severity;
      var ruled = document.createElement("td"); ruled.textContent = f.ruleId;
      var locd = document.createElement("td"); locd.className = "mono"; locd.textContent = f.location;
      var msgd = document.createElement("td"); msgd.textContent = f.message;
      tr.appendChild(sevd); tr.appendChild(ruled); tr.appendChild(locd); tr.appendChild(msgd);
      tbody.appendChild(tr);
    });
    table.appendChild(tbody); box.appendChild(table);
    if (findings.length > 50) {
      var more = document.createElement("p"); more.className = "hint";
      more.textContent = "Showing 50 of " + findings.length + " findings.";
      box.appendChild(more);
    }
  }

  function loadCompareOptions() {
    api("/api/runs").then(function (res) {
      var payload = res.payload || {};
      var succeeded = payload.ok === true
        ? (payload.runs || []).filter(function (r) { return r.state === "succeeded" && r.summary; })
        : [];
      [el("cmp-left"), el("cmp-right")].forEach(function (select) {
        clear(select);
        succeeded.forEach(function (run) {
          var option = document.createElement("option");
          option.value = run.id;
          option.textContent = run.id + " · " + run.startedAt + " · " + run.summary.total + " findings";
          select.appendChild(option);
        });
        if (select.options.length > 1 && select === el("cmp-right")) select.selectedIndex = 1;
      });
      var body = el("cmp-body");
      clear(body);
      if (succeeded.length < 2) {
        var note = document.createElement("p"); note.className = "hint";
        note.textContent = "Need at least two succeeded runs over the same inputs to compare.";
        body.appendChild(note);
      }
    });
  }

  el("cmp-btn").addEventListener("click", function () {
    var left = el("cmp-left").value;
    var right = el("cmp-right").value;
    var body = el("cmp-body");
    clear(body);
    if (!left || !right || left === right) {
      var pick = document.createElement("p"); pick.className = "hint";
      pick.textContent = "Pick two different runs.";
      body.appendChild(pick);
      return;
    }
    api("/api/compare?left=" + encodeURIComponent(left) + "&right=" + encodeURIComponent(right)).then(function (res) {
      var payload = res.payload || {};
      if (payload.ok !== true) {
        var err = document.createElement("p"); err.className = "err";
        err.textContent = payload.error || "Comparison failed.";
        body.appendChild(err);
        return;
      }
      var s = payload.summary || { newCount: 0, repeatedCount: 0, resolvedCount: 0 };
      var head = document.createElement("p");
      head.textContent = payload.left.id + " → " + payload.right.id + " · new " + s.newCount + " · repeated " + s.repeatedCount + " · resolved " + s.resolvedCount;
      body.appendChild(head);
      var news = payload.newFindings || [];
      if (news.length > 0) {
        var h = document.createElement("h3"); h.textContent = "New findings"; body.appendChild(h);
        var table = document.createElement("table");
        var thead = document.createElement("thead");
        var hr = document.createElement("tr");
        ["severity", "rule", "location", "message"].forEach(function (col) {
          var th = document.createElement("th"); th.textContent = col; hr.appendChild(th);
        });
        thead.appendChild(hr); table.appendChild(thead);
        var tbody = document.createElement("tbody");
        news.forEach(function (f) {
          var tr = document.createElement("tr");
          var sevd = document.createElement("td"); sevd.className = "sev-" + f.severity; sevd.textContent = f.severity;
          var ruled = document.createElement("td"); ruled.textContent = f.ruleId;
          var locd = document.createElement("td"); locd.className = "mono"; locd.textContent = f.location;
          var msgd = document.createElement("td"); msgd.textContent = f.message;
          tr.appendChild(sevd); tr.appendChild(ruled); tr.appendChild(locd); tr.appendChild(msgd);
          tbody.appendChild(tr);
        });
        table.appendChild(tbody); body.appendChild(table);
      } else {
        var noNew = document.createElement("p"); noNew.className = "hint";
        noNew.textContent = "No new findings in the current run.";
        body.appendChild(noNew);
      }
    });
  });

  loadCatalog();
})();
</script>
</body>
</html>
`;
}
