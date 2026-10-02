const LABELS = {
  taste: "☕ Coffee taste",
  milk: "🥛 Milk drinks",
  ease: "👆 Ease of use",
  speed: "⚡ Speed",
  cleaning: "🧼 Cleaning / hassle",
  overall: "❤️ Overall",
};
const HAPPY = [
  { key: "no", label: "👎 No" },
  { key: "okay", label: "😐 It's okay" },
  { key: "yes", label: "👍 Yes" },
];

const PW_KEY = "cn_admin_pw";
const params = new URLSearchParams(location.search);
let current = params.get("m") || "";
let password = storage("get") || "";
let lastData = null;
const $ = (sel) => document.querySelector(sel);

if (password) load();
else showLogin();
setInterval(() => password && load(), 10000);

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

async function load() {
  const query = new URLSearchParams();
  if (current) query.set("m", current);
  let data;
  try {
    const res = await fetch(`/api/results?${query}`, { headers: { "X-Admin-Password": password } });
    data = await res.json();
    if (res.status === 401) {
      password = "";
      storage("del");
      return showLogin("Wrong password, try again.");
    }
    if (!res.ok) throw new Error(data.error || "Could not load results.");
  } catch (err) {
    return showMessage(err.message);
  }
  storage("set", password);
  $("#login").hidden = true;
  $("#dashboard").hidden = false;

  renderTabs(data.machines, data.machine);
  if (!data.machine) {
    if (!$("#qr").hasChildNodes()) makeQr("coffee-machine");
    return showMessage("No votes yet. Share the QR code below to get started ☕");
  }
  if (!current) {
    current = data.machine;
    makeQr(current);
  } else if (!$("#qr").hasChildNodes()) {
    makeQr(current);
  }
  $("#message").hidden = true;
  render(data);
}

function showMessage(text) {
  const el = $("#message");
  el.textContent = text;
  el.hidden = false;
  ["#stats", "#breakdown", "#happy", "#comments-card", "#votes-card"].forEach((s) => ($(s).hidden = true));
}

function prettify(slug) {
  return slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function slugify(text) {
  return text.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 40);
}

function renderTabs(machines, active) {
  const tabs = $("#tabs");
  tabs.innerHTML = "";
  machines.forEach((m) => {
    const tab = document.createElement("button");
    tab.className = `tab${m.machine === active ? " active" : ""}`;
    tab.textContent = `${prettify(m.machine)} · ${m.votes}`;
    tab.addEventListener("click", () => {
      current = m.machine;
      const url = new URL(location.href);
      url.searchParams.set("m", current);
      history.replaceState(null, "", url);
      makeQr(current);
      load();
    });
    tabs.appendChild(tab);
  });
  $("#title").textContent = active ? prettify(active) : "Results";
}

function render(data) {
  ["#stats", "#breakdown", "#happy"].forEach((s) => ($(s).hidden = false));

  $("#stat-total").textContent = data.total;
  $("#stat-overall").textContent = data.total ? data.categories.overall.average.toFixed(1) : "–";
  $("#stat-yes").textContent = data.total ? `${Math.round((data.happy.yes / data.total) * 100)}%` : "–";

  const bars = $("#bars");
  bars.innerHTML = Object.entries(LABELS).map(([k, label]) => {
    const c = data.categories[k];
    const max = Math.max(1, ...c.distribution);
    return `
      <div class="bar-row">
        <div class="bar-head"><span>${label}</span><strong>${c.average.toFixed(1)}</strong></div>
        <div class="bar"><div class="bar-fill" style="--w:${(c.average / 5) * 100}%"></div></div>
        <div class="dist" title="How many people picked 1, 2, 3, 4, 5">
          ${c.distribution.map((n, i) => `<div class="dist-col"><div class="dist-fill" style="--h:${(n / max) * 100}%"></div><span>${i + 1}</span></div>`).join("")}
        </div>
      </div>`;
  }).join("");
  requestAnimationFrame(() => bars.classList.add("grow"));

  const total = Math.max(1, data.total);
  $("#happy-bar").innerHTML = HAPPY.map((h) => `<div class="happy-seg ${h.key}" style="flex:${data.happy[h.key]}"></div>`).join("");
  $("#happy-legend").innerHTML = HAPPY.map((h) => `<span>${h.label} <strong>${data.happy[h.key]}</strong> (${Math.round((data.happy[h.key] / total) * 100)}%)</span>`).join("");

  const list = $("#comments");
  list.innerHTML = "";
  data.comments.forEach((c) => {
    const item = document.createElement("li");
    const mood = HAPPY.find((h) => h.key === c.happy);
    item.innerHTML = `<p></p><span>${mood ? mood.label : ""} · overall ${c.overall}/5</span>`;
    item.querySelector("p").textContent = c.text;
    list.appendChild(item);
  });
  $("#comments-card").hidden = data.comments.length === 0;

  lastData = data;
  const tbody = $("#votes");
  tbody.innerHTML = "";
  data.votes.forEach((v) => {
    const row = document.createElement("tr");
    const mood = HAPPY.find((h) => h.key === v.happy);
    [v.created_at, v.taste, v.milk, v.ease, v.speed, v.cleaning, v.overall, mood ? mood.label : v.happy, v.comment || ""].forEach((value) => {
      const cell = document.createElement("td");
      cell.textContent = value;
      row.appendChild(cell);
    });
    tbody.appendChild(row);
  });
  $("#votes-card").hidden = data.votes.length === 0;
}

$("#csv").addEventListener("click", () => {
  if (!lastData) return;
  const cols = ["created_at", "taste", "milk", "ease", "speed", "cleaning", "overall", "happy", "comment"];
  const escape = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  const lines = [cols.join(","), ...lastData.votes.map((v) => cols.map((c) => escape(v[c])).join(","))];
  const blob = new Blob([lines.join("\n")], { type: "text/csv" });
  const link = document.createElement("a");
  link.href = URL.createObjectURL(blob);
  link.download = `${lastData.machine}-votes.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
});

function voteUrl(slug) {
  const url = new URL("/", location.origin);
  url.searchParams.set("m", slug);
  return url.toString();
}

function drawQr(el, text, size) {
  el.innerHTML = "";
  if (!window.QRCode) {
    el.textContent = "QR library did not load. Share the link instead.";
    return;
  }
  new QRCode(el, { text, width: size, height: size, colorDark: "#2b1a12", colorLight: "#fffaf3", correctLevel: QRCode.CorrectLevel.M });
}

function makeQr(slug) {
  const url = voteUrl(slug);
  drawQr($("#qr"), url, 220);
  const link = $("#qr-link");
  link.href = url;
  link.textContent = url;
  $("#qr-machine").value = prettify(slug);
  $("#qr-stage-title").textContent = prettify(slug);
  $("#qr-big").dataset.url = url;
}

$("#qr-form").addEventListener("submit", (event) => {
  event.preventDefault();
  const slug = slugify($("#qr-machine").value);
  if (slug) makeQr(slug);
});

$("#qr-fullscreen").addEventListener("click", () => {
  const stage = $("#qr-stage");
  stage.hidden = false;
  const size = Math.min(window.innerWidth, window.innerHeight) * 0.6;
  drawQr($("#qr-big"), $("#qr-big").dataset.url, size);
  stage.requestFullscreen?.().catch(() => {});
});

$("#qr-stage").addEventListener("click", () => {
  $("#qr-stage").hidden = true;
  if (document.fullscreenElement) document.exitFullscreen();
});

document.addEventListener("fullscreenchange", () => {
  if (!document.fullscreenElement) $("#qr-stage").hidden = true;
});
