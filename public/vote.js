const CATEGORIES = [
  { key: "taste", emoji: "☕", title: "Coffee taste", question: "How good is the coffee?", low: "Terrible", high: "Excellent", photo: "1447933601403-0c6688de566e" },
  { key: "milk", emoji: "🥛", title: "Milk drinks", question: "How good are cappuccino, latte etc.?", low: "Terrible", high: "Excellent", photo: "1461023058943-07fcbe16d735" },
  { key: "ease", emoji: "👆", title: "Ease of use", question: "How easy was it to make your drink?", low: "Difficult", high: "Effortless", photo: "1511920170033-f8396924c348" },
  { key: "speed", emoji: "⚡", title: "Speed", question: "Was it fast enough for office use?", low: "Too slow", high: "Very fast", photo: "1509042239860-f550ce710b93" },
  { key: "cleaning", emoji: "🧼", title: "Cleaning / hassle", question: "How practical does it seem day-to-day?", low: "Painful", high: "Effortless", photo: "1442512595331-e89e73853f31" },
  { key: "overall", emoji: "❤️", title: "Overall", question: "How much would you like this machine in the office?", low: "Not at all", high: "Love it", photo: "1497935586351-b67a49e012bf" },
];
const params = new URLSearchParams(location.search);
const requested = (params.get("m") || window.DEFAULT_MACHINE).toLowerCase().replace(/[^a-z0-9-]/g, "").slice(0, 40) || window.DEFAULT_MACHINE;
const machine = window.MACHINE_ALIASES[requested] || requested;
const info = window.MACHINES[machine];
const machineName = params.get("name") || (info ? `${info.maker} ${info.name}` : prettify(machine));
const votedKey = `cn_voted_${machine}`;
const askBeans = !info || info.askBeans !== false;
// Six ratings, the office machine question and, when asked, the beans question.
const TOTAL = CATEGORIES.length + 1 + (askBeans ? 1 : 0);

const answers = { ratings: {}, happy: null, beans: null };
const $ = (sel) => document.querySelector(sel);

$("#machine-name").textContent = machineName;
document.title = `CaffieNation · Rate ${machineName}`;

showMachine();
renderCategories();
wireChoices(".happy-card", "happy");
if (askBeans) wireChoices(".beans-card", "beans");
revealOnScroll();
sprinkleBeans();
updateProgress();

if (localStorage.getItem(votedKey)) showDone(true);
checkVoted();

// The server is the source of truth: it knows this device's cookie, and an
// admin may have deleted the vote since.
async function checkVoted() {
  try {
    const res = await fetch(`/api/status?m=${encodeURIComponent(machine)}`);
    const { voted } = await res.json();
    if (voted && !localStorage.getItem(votedKey)) {
      localStorage.setItem(votedKey, "server");
      showDone(true);
    } else if (!voted && localStorage.getItem(votedKey)) {
      localStorage.removeItem(votedKey);
      hideDone();
    }
  } catch {}
}

function hideDone() {
  const overlay = $("#done");
  overlay.classList.remove("show");
  overlay.hidden = true;
  document.body.classList.remove("locked");
}

function prettify(slug) {
  return slug.split("-").map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(" ");
}

function showMachine() {
  if (!info) return;
  $("#machine-maker").textContent = `Today's machine · ${info.maker}`;
  $("#machine-title").textContent = info.name;
  $("#machine-tagline").textContent = info.tagline;
  $("#machine-link").href = info.link;
  const img = $("#machine-img");
  img.alt = `${info.maker} ${info.name}`;
  img.onerror = () => img.parentElement.classList.add("missing");
  img.src = info.image;
  $("#machine-card").hidden = false;
  $("#beans-note").hidden = !info.redBeans;
  if (!askBeans) $("#beans-card").remove();
  else if (info.beanOptions) renderBeanOptions();
}

function renderBeanOptions() {
  const card = $("#beans-card");
  const question = info.beanQuestion || card.querySelector("h2").textContent;
  card.querySelector("h2").textContent = question;
  const choices = card.querySelector(".choices");
  choices.setAttribute("aria-label", question);
  choices.innerHTML = "";
  for (const [value, emoji, label, note] of info.beanOptions) {
    const btn = document.createElement("button");
    btn.type = "button";
    btn.className = "choice";
    btn.setAttribute("role", "radio");
    btn.setAttribute("aria-checked", "false");
    btn.dataset.value = value;
    const icon = document.createElement("span");
    icon.className = "choice-emoji";
    icon.textContent = emoji;
    btn.append(icon, label);
    if (note) {
      const small = document.createElement("small");
      small.textContent = note;
      btn.append(small);
    }
    choices.append(btn);
  }
}

function voterId() {
  let id = localStorage.getItem("cn_voter_id");
  if (!id) {
    id = crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
    localStorage.setItem("cn_voter_id", id);
  }
  return id;
}

function renderCategories() {
  const container = $("#categories");
  CATEGORIES.forEach((cat, i) => {
    const card = document.createElement("section");
    card.className = "card reveal";
    card.style.setProperty("--delay", `${i * 40}ms`);
    card.innerHTML = `
      <div class="card-photo" style="--photo: url('https://images.unsplash.com/photo-${cat.photo}?w=900&q=65&auto=format&fit=crop')">
        <span class="badge">${cat.emoji}</span>
      </div>
      <div class="card-body">
        <p class="step">${i + 1} / ${TOTAL}</p>
        <h2>${cat.title}</h2>
        <p class="question">${cat.question}</p>
        <div class="scale" role="radiogroup" aria-label="${cat.question}">
          ${[1, 2, 3, 4, 5].map((n) => `<button type="button" class="dot" role="radio" aria-checked="false" aria-label="${n} of 5" data-value="${n}"><span>${n}</span></button>`).join("")}
        </div>
        <div class="scale-labels"><span>${cat.low}</span><span>${cat.high}</span></div>
        <button type="button" class="skip" aria-pressed="false">🤷 Didn't try / don't know</button>
      </div>`;
    const skip = card.querySelector(".skip");
    const select = (value) => {
      answers.ratings[cat.key] = value;
      card.querySelectorAll(".dot").forEach((d) => {
        const v = Number(d.dataset.value);
        d.classList.toggle("filled", value !== "na" && v <= value);
        d.classList.toggle("selected", v === value);
        d.setAttribute("aria-checked", String(v === value));
      });
      skip.classList.toggle("selected", value === "na");
      skip.setAttribute("aria-pressed", String(value === "na"));
      card.classList.add("answered");
      updateProgress();
      nudgeToNext(card);
    };
    skip.addEventListener("click", () => select("na"));
    card.querySelectorAll(".dot").forEach((dot) => {
      dot.addEventListener("click", () => {
        select(Number(dot.dataset.value));
      });
    });
    container.appendChild(card);
  });
}

function wireChoices(selector, answerKey) {
  const card = document.querySelector(selector);
  card.querySelectorAll(".choice").forEach((btn) => {
    btn.addEventListener("click", () => {
      answers[answerKey] = btn.dataset.value;
      card.querySelectorAll(".choice").forEach((b) => {
        b.classList.toggle("selected", b === btn);
        b.setAttribute("aria-checked", String(b === btn));
      });
      card.classList.add("answered");
      updateProgress();
      nudgeToNext(card);
    });
  });
}

function nudgeToNext(card) {
  const next = card.nextElementSibling || card.parentElement.nextElementSibling;
  if (!next || !next.classList.contains("card")) return;
  const rect = next.getBoundingClientRect();
  if (rect.top > window.innerHeight * 0.6) {
    setTimeout(() => next.scrollIntoView({ behavior: "smooth", block: "center" }), 250);
  }
}

function updateProgress() {
  const done = Object.keys(answers.ratings).length + (answers.happy ? 1 : 0) + (answers.beans ? 1 : 0);
  $("#progress-fill").style.width = `${(done / TOTAL) * 100}%`;
  $("#progress-text").textContent = done === TOTAL ? "All set, ready to send ☕" : `${done} of ${TOTAL} answered`;
  $("#submit").disabled = done !== TOTAL;
}

$("#vote-form").addEventListener("submit", async (event) => {
  event.preventDefault();
  const button = $("#submit");
  const error = $("#error");
  error.hidden = true;
  button.disabled = true;
  button.textContent = "Brewing…";
  try {
    const res = await fetch("/api/vote", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        machine,
        voterId: voterId(),
        ratings: answers.ratings,
        happy: answers.happy,
        beans: answers.beans,
        comment: $("#comment").value,
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (res.ok || data.alreadyVoted) {
      localStorage.setItem(votedKey, new Date().toISOString());
      showDone(!res.ok);
      return;
    }
    throw new Error(data.error || "Could not send your vote.");
  } catch (err) {
    error.textContent = `${err.message} Please try again.`;
    error.hidden = false;
    button.disabled = false;
    button.textContent = "Send my vote";
  }
});

function showDone(already) {
  if (already) {
    $("#done-title").textContent = "You've already voted ☕";
    $("#done-text").textContent = `Thanks! We only count one vote per person for ${machineName}.`;
  }
  const overlay = $("#done");
  overlay.hidden = false;
  requestAnimationFrame(() => overlay.classList.add("show"));
  document.body.classList.add("locked");
  if (!already) burst();
}

function revealOnScroll() {
  const items = document.querySelectorAll(".reveal");
  if (!("IntersectionObserver" in window)) {
    items.forEach((el) => el.classList.add("in"));
    return;
  }
  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add("in");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.15 });
  items.forEach((el) => observer.observe(el));
}

function sprinkleBeans() {
  const layer = document.querySelector(".beans");
  for (let i = 0; i < 14; i++) {
    const bean = document.createElement("span");
    bean.className = "bean";
    bean.style.left = `${Math.random() * 100}%`;
    bean.style.animationDuration = `${14 + Math.random() * 16}s`;
    bean.style.animationDelay = `${-Math.random() * 30}s`;
    bean.style.setProperty("--size", `${10 + Math.random() * 14}px`);
    bean.style.setProperty("--spin", `${Math.random() > 0.5 ? 1 : -1}`);
    layer.appendChild(bean);
  }
}

function burst() {
  const overlay = $("#done");
  for (let i = 0; i < 28; i++) {
    const bean = document.createElement("span");
    bean.className = "burst-bean";
    const angle = Math.random() * Math.PI * 2;
    const distance = 120 + Math.random() * 180;
    bean.style.setProperty("--x", `${Math.cos(angle) * distance}px`);
    bean.style.setProperty("--y", `${Math.sin(angle) * distance}px`);
    bean.style.setProperty("--r", `${Math.random() * 720 - 360}deg`);
    bean.style.animationDelay = `${Math.random() * 150}ms`;
    overlay.appendChild(bean);
    setTimeout(() => bean.remove(), 1800);
  }
}
