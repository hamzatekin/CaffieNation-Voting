const LABELS = {
  taste: "☕ Coffee taste",
  milk: "🥛 Milk drinks",
  ease: "👆 Ease of use",
  speed: "⚡ Speed",
  cleaning: "🧼 Cleaning / hassle",
  overall: "❤️ Overall",
};
const HAPPY = { no: "👎 No", okay: "😐 It's okay", yes: "👍 Yes" };
const PW_KEY = "cn_admin_pw";
const ALL = "all";
// One color per machine, in the order the machines were first demoed.
const SERIES = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#4a3aa7", "#e34948"];

const $ = (sel) => document.querySelector(sel);
let current = new URLSearchParams(location.search).get("m") || "";
let password = storage("get") || "";
let lastData = null;

if (password) load();
else showLogin();
setInterval(() => password && load(), 15000);

function storage(op, value) {
  try {
    if (op === "get") return localStorage.getItem(PW_KEY);
    if (op === "set") localStorage.setItem(PW_KEY, value);
    if (op === "del") localStorage.removeItem(PW_KEY);
  } catch {}
  return null;
}

function showLogin(error) {
  $("#dashboard").hidden = true;
  $("#login").hidden = false;
  $("#login-error").hidden = !error;
  $("#login-error").textContent = error || "";
  $("#password").focus();
}

function showMessage(text) {
  $("#message").textContent = text;
  $("#message").hidden = false;
  $("#results").hidden = true;
  $("#overview").hidden = true;
}

function machineName(slug) {
  const info = window.MACHINES && window.MACHINES[slug];
  return info ? `${info.maker} ${info.name}` : slug;
}

$("#login").addEventListener("submit", (event) => {
  event.preventDefault();
  password = $("#password").value;
  load();
});

$("#logout").addEventListener("click", () => {
  password = "";
  storage("del");
  $("#password").value = "";
  showLogin();
});

async function api(path, options = {}) {
  const res = await fetch(path, { ...options, headers: { "X-Admin-Password": password } });
  const data = await res.json().catch(() => ({}));
  if (res.status === 401) {
    password = "";
    storage("del");
    showLogin("Wrong password, try again.");
    return null;
  }
  if (!res.ok) throw new Error(data.error || "Could not load results.");
  return data;
}

async function load() {
  if (current === ALL) return loadOverview();
  let data;
  try {
    data = await api(`/api/results${current ? `?m=${encodeURIComponent(current)}` : ""}`);
  } catch (err) {
    $("#dashboard").hidden = false;
    return showMessage(err.message);
  }
  if (!data) return;
  storage("set", password);
  $("#login").hidden = true;
  $("#dashboard").hidden = false;
  $("#overview").hidden = true;

  try {
    renderTabs(data.machines, data.machine);
    if (!data.machine || !data.total) return showMessage("No votes yet ☕");
    $("#message").hidden = true;
    render(data);
    $("#results").hidden = false;
  } catch (err) {
    showMessage(`Could not show the results (${err.message}). Please send this to Claude.`);
  }
}

async function loadOverview() {
  let data;
  try {
    data = await api("/api/overview");
  } catch (err) {
    $("#dashboard").hidden = false;
    return showMessage(err.message);
  }
  if (!data) return;
  storage("set", password);
  $("#login").hidden = true;
  $("#dashboard").hidden = false;
  $("#results").hidden = true;

  try {
    const byLastVote = [...data.machines].sort((a, b) => (a.lastVote < b.lastVote ? 1 : -1));
    renderTabs(byLastVote, ALL);
    if (!data.machines.length) return showMessage("No votes yet ☕");
    $("#message").hidden = true;
    renderOverview(data);
    $("#overview").hidden = false;
  } catch (err) {
    showMessage(`Could not show the results (${err.message}). Please send this to Claude.`);
  }
}

function renderTabs(machines, active) {
  const tabs = $("#tabs");
  tabs.innerHTML = "";
  if (machines.length > 1) {
    const all = el("button", `tab${active === ALL ? " active" : ""}`, "📊 All machines");
    all.addEventListener("click", () => {
      current = ALL;
      load();
    });
    tabs.appendChild(all);
  }
  machines.forEach((m) => {
    const tab = document.createElement("button");
    tab.className = `tab${m.machine === active ? " active" : ""}`;
    tab.textContent = `${machineName(m.machine)} · ${m.votes}`;
    tab.addEventListener("click", () => {
      current = m.machine;
      load();
    });
    tabs.appendChild(tab);
  });
  $("#title").textContent = active === ALL ? "All machines" : active ? machineName(active) : "Results";
}

function render(data) {
  lastData = data;
  const pct = (n) => `${Math.round((n / data.total) * 100)}%`;
  const rows = [["🗳️ Votes", el("span", "score", String(data.total))]];
  for (const [key, label] of Object.entries(LABELS)) {
    const c = data.categories[key];
    const cell = document.createDocumentFragment();
    if (c.average === null) {
      cell.append(el("span", "score", "–"));
    } else {
      const meter = el("span", "meter");
      meter.append(el("span"));
      meter.firstChild.style.width = `${(c.average / 5) * 100}%`;
      cell.append(el("span", "score", c.average.toFixed(1)), el("span", "out-of", "/ 5"), meter);
    }
    if (c.skipped) cell.append(el("span", "skipped-note", `${c.skipped} didn't try`));
    rows.push([label, cell]);
  }
  rows.push(["🙂 Happy as office machine?", pills(Object.entries(HAPPY).map(([k, l]) => [l, data.happy[k], pct(data.happy[k])]))]);
  const BEANS = beanLabels(data.machine);
  if (Object.values(data.beans).some(Boolean)) {
    rows.push(["🫘 Preferred beans", pills(Object.entries(BEANS).map(([k, l]) => [l, data.beans[k] || 0, pct(data.beans[k] || 0)]))]);
  }

  const summary = $("#summary");
  summary.innerHTML = "";
  rows.forEach(([label, value]) => {
    const tr = document.createElement("tr");
    const td = document.createElement("td");
    td.append(value);
    tr.append(el("th", "", label), td);
    summary.appendChild(tr);
  });

  $(".votes-table").classList.toggle("no-beans", !data.votes.some((v) => v.beans));
  const tbody = $("#votes");
  tbody.innerHTML = "";
  data.votes.forEach((v) => {
    const tr = document.createElement("tr");
    [v.created_at, v.taste, v.milk, v.ease, v.speed, v.cleaning, v.overall, HAPPY[v.happy] || v.happy, BEANS[v.beans] || "", v.comment || ""].forEach((value) => {
      const td = document.createElement("td");
      td.textContent = value ?? "–";
      tr.appendChild(td);
    });
    const delCell = document.createElement("td");
    const del = document.createElement("button");
    del.className = "delete";
    del.type = "button";
    del.title = "Delete this vote";
    del.textContent = "🗑️";
    del.addEventListener("click", () => deleteVote(v.id));
    delCell.appendChild(del);
    tr.prepend(delCell);
    tbody.appendChild(tr);
  });
}

function el(tag, className = "", text = "") {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text) node.textContent = text;
  return node;
}

function pills(items) {
  const wrap = el("div", "pills");
  items.forEach(([label, count, share]) => {
    const pill = el("span", `pill${count ? "" : " zero"}`, label);
    pill.append(el("strong", "", String(count)), el("small", "", share));
    wrap.append(pill);
  });
  return wrap;
}

async function deleteVote(id) {
  if (!confirm("Delete this vote? This can't be undone.")) return;
  try {
    if (await api(`/api/votes/${id}`, { method: "DELETE" })) load();
  } catch (err) {
    alert(err.message);
  }
}

$("#csv").addEventListener("click", () => {
  if (!lastData) return;
  const cols = ["created_at", "taste", "milk", "ease", "speed", "cleaning", "overall", "happy", "beans", "comment"];
  const escape = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const beanNames = beanLabels(lastData.machine, false);
  const value = (v, c) => (c === "beans" ? beanNames[v.beans] : v[c]) ?? (LABELS[c] ? "n/a" : "");
  const lines = [cols.join(","), ...lastData.votes.map((v) => cols.map((c) => escape(value(v, c))).join(","))];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${lastData.machine}-votes.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
});

// Bean answer labels for one machine, from its beanOptions in machines.js.
function beanLabels(machine, withEmoji = true) {
  const options = (window.MACHINES[machine] && window.MACHINES[machine].beanOptions) || window.DEFAULT_BEAN_OPTIONS;
  return Object.fromEntries(options.map(([value, emoji, label]) => [value, withEmoji ? `${emoji} ${label}` : label]));
}

// ---------- All machines ----------

function renderOverview(data) {
  const machines = data.machines.map((m, i) => ({
    ...m,
    color: SERIES[i % SERIES.length],
    name: machineName(m.machine),
    short: (window.MACHINES[m.machine] && window.MACHINES[m.machine].name) || m.machine,
  }));
  const yesShare = (m) => (m.votes ? m.happy.yes / m.votes : 0);
  const ranked = [...machines].sort((a, b) => (b.averages.overall ?? 0) - (a.averages.overall ?? 0) || yesShare(b) - yesShare(a));
  const leader = ranked[0];

  const happiest = [...machines].sort((a, b) => yesShare(b) - yesShare(a))[0];
  let takeaway = `${leader.name} leads overall with ${fmt(leader.averages.overall)} / 5`;
  takeaway += happiest === leader
    ? `, and ${pctText(yesShare(leader))} of its voters would be happy with it as the office machine.`
    : `. ${happiest.name} has the most "Yes, I'd be happy" votes (${pctText(yesShare(happiest))}).`;
  $("#takeaway").textContent = `${machines.length} machines, ${machines.reduce((n, m) => n + m.votes, 0)} votes. ${takeaway}`;

  // Leaderboard: one tile per machine, best overall first.
  const board = $("#leaderboard");
  board.innerHTML = "";
  ranked.forEach((m, i) => {
    const tile = el("article", `tile${i === 0 ? " first" : ""}`);
    tile.style.setProperty("--series", m.color);
    const head = el("div", "tile-head");
    head.append(el("span", "rank", i === 0 ? "👑" : `#${i + 1}`), el("span", "tile-name", m.name));
    const score = el("div", "tile-score");
    score.append(el("span", "big", fmt(m.averages.overall)), el("span", "out-of", "/ 5 overall"));
    const facts = el("div", "tile-facts");
    facts.append(
      el("span", "", `👍 ${pctText(yesShare(m))} happy`),
      el("span", "", `🗳️ ${m.votes} vote${m.votes === 1 ? "" : "s"}`),
      el("span", "", `📅 ${shortDate(m.firstVote)}`),
    );
    tile.append(head, score, facts);
    board.append(tile);
  });

  // Legend + grouped bars per category.
  const legend = $("#legend");
  legend.innerHTML = "";
  machines.forEach((m) => {
    const item = el("span");
    const sw = el("i", "swatch");
    sw.style.background = m.color;
    item.append(sw, m.short);
    legend.append(item);
  });

  const compare = $("#compare");
  compare.innerHTML = "";
  for (const [key, label] of Object.entries(LABELS)) {
    const best = Math.max(...machines.map((m) => m.averages[key] ?? 0));
    const group = el("div", "compare-group");
    group.append(el("h3", "", label));
    machines.forEach((m) => {
      const value = m.averages[key];
      const row = el("div", "cmp-row");
      row.title = `${m.name}: ${value === null ? "nobody rated this" : `${value.toFixed(2)} / 5`}`;
      const track = el("span", "cmp-track");
      const bar = el("span", "cmp-bar");
      bar.style.width = `${((value ?? 0) / 5) * 100}%`;
      bar.style.background = m.color;
      track.append(bar);
      const isBest = value !== null && value === best && machines.length > 1;
      row.append(el("span", "cmp-name", m.short), track, el("span", `cmp-value${isBest ? " best" : ""}`, `${fmt(value)}${isBest ? " 👑" : ""}`));
      group.append(row);
    });
    compare.append(group);
  }

  // Happy split, one 100% bar per machine.
  const happy = $("#happy-bars");
  happy.innerHTML = "";
  machines.forEach((m) => {
    const row = el("div", "happy-row");
    row.append(el("span", "cmp-name", m.short));
    const stack = el("span", "stack");
    for (const k of ["yes", "okay", "no"]) {
      const n = m.happy[k];
      if (!n) continue;
      const share = n / m.votes;
      const seg = el("span", `seg happy-${k}`, share >= 0.12 ? pctText(share) : "");
      seg.style.flexGrow = n;
      seg.title = `${HAPPY[k]}: ${n} of ${m.votes} (${pctText(share)})`;
      stack.append(seg);
    }
    row.append(stack);
    happy.append(row);
  });

  renderSummary(data.summary, data.commentCount);
}

function renderSummary(summary, commentCount) {
  const box = $("#ai-text");
  const meta = $("#ai-meta");
  const button = $("#ai-run");
  if (box.dataset.busy) return;
  box.innerHTML = "";
  button.textContent = summary ? "Refresh" : "Summarise";
  button.disabled = !commentCount;
  if (!summary) {
    box.append(el("p", "question", commentCount
      ? `${commentCount} comments so far. Press Summarise for a short AI summary of what people said about each machine.`
      : "No comments yet."));
    meta.textContent = "";
    return;
  }
  box.append(markdownLite(summary.text));
  const fresh = commentCount - summary.commentCount;
  meta.textContent = `Based on ${summary.commentCount} comments · made ${new Date(summary.generatedAt).toLocaleString()}` +
    (fresh > 0 ? ` · ${fresh} new comment${fresh === 1 ? "" : "s"} since, press Refresh to include them` : "") +
    ". AI can get things wrong, so check the comments for anything important.";
}

$("#ai-run").addEventListener("click", async () => {
  const box = $("#ai-text");
  const button = $("#ai-run");
  const names = Object.fromEntries(Object.keys(window.MACHINES).map((slug) => [slug, machineName(slug)]));
  box.dataset.busy = "1";
  button.disabled = true;
  button.textContent = "Summarising…";
  try {
    const res = await fetch("/api/summary", {
      method: "POST",
      headers: { "X-Admin-Password": password, "Content-Type": "application/json" },
      body: JSON.stringify({ names }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || "The AI summary failed.");
  } catch (err) {
    alert(err.message);
  }
  delete box.dataset.busy;
  button.disabled = false;
  loadOverview();
});

// The model answers in light markdown: "- " bullets, "#" headings and **bold**.
function markdownLite(text) {
  const frag = document.createDocumentFragment();
  let list = null;
  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line) {
      list = null;
      continue;
    }
    const bullet = line.match(/^(?:[-*•]|\d+\.)\s+(.*)$/);
    const heading = line.match(/^#+\s*(.*)$/);
    if (bullet) {
      if (!list) frag.append((list = el("ul")));
      list.append(inline(el("li"), bullet[1]));
    } else {
      list = null;
      frag.append(inline(el(heading ? "h3" : "p"), heading ? heading[1] : line));
    }
  }
  return frag;
}

function inline(node, text) {
  text.split(/(\*\*[^*]+\*\*)/).forEach((part) => {
    if (/^\*\*[^*]+\*\*$/.test(part)) node.append(el("strong", "", part.slice(2, -2)));
    else if (part) node.append(part);
  });
  return node;
}

function fmt(value) {
  return value === null || value === undefined ? "–" : value.toFixed(1);
}

function pctText(share) {
  return `${Math.round(share * 100)}%`;
}

function shortDate(sqlDate) {
  const d = new Date(`${String(sqlDate).replace(" ", "T")}Z`);
  return isNaN(d) ? "" : d.toLocaleDateString(undefined, { day: "numeric", month: "short" });
}
