const LABELS = {
  taste: "☕ Coffee taste",
  milk: "🥛 Milk drinks",
  ease: "👆 Ease of use",
  speed: "⚡ Speed",
  cleaning: "🧼 Cleaning / hassle",
  overall: "❤️ Overall",
};
const HAPPY = { no: "👎 No", okay: "😐 It's okay", yes: "👍 Yes" };
const BEANS = { red: "🔴 Red beans", black: "⚫ Black beans", any: "🤷 Don't mind" };
const PW_KEY = "cn_admin_pw";

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

function renderTabs(machines, active) {
  const tabs = $("#tabs");
  tabs.innerHTML = "";
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
  $("#title").textContent = active ? machineName(active) : "Results";
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
  if (Object.values(data.beans).some(Boolean)) {
    rows.push(["🫘 Preferred beans", pills(Object.entries(BEANS).map(([k, l]) => [l, data.beans[k], pct(data.beans[k])]))]);
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
  const lines = [cols.join(","), ...lastData.votes.map((v) => cols.map((c) => escape(v[c] ?? (LABELS[c] ? "n/a" : ""))).join(","))];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${lastData.machine}-votes.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
});
