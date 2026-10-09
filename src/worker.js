// CaffieNation voting API. Static files in /public are served by Cloudflare
// directly; only /api/* reaches this Worker.

const CATEGORIES = ["taste", "milk", "ease", "speed", "cleaning", "overall"];
const HAPPY = ["no", "okay", "yes"];
// Stored bean answers. Machines relabel them with beanOptions in public/machines.js.
const BEANS = ["red", "black", "any"];
const SLUG = /^[a-z0-9-]{1,40}$/;
const VOTER_ID = /^[A-Za-z0-9-]{8,64}$/;
const COOKIE = "cn_vid";
const ONE_YEAR = 60 * 60 * 24 * 365;

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    try {
      if (url.pathname === "/api/vote" && request.method === "POST") {
        return await submitVote(request, env);
      }
      if (url.pathname === "/api/results" && request.method === "GET") {
        return await results(request, url, env);
      }
      if (url.pathname === "/api/overview" && request.method === "GET") {
        return await overview(request, env);
      }
      if (url.pathname === "/api/summary" && request.method === "POST") {
        return await generateSummary(request, env);
      }
      if (url.pathname === "/api/status" && request.method === "GET") {
        return await status(request, url, env);
      }
      const del = url.pathname.match(/^\/api\/votes\/(\d+)$/);
      if (del && request.method === "DELETE") {
        return await deleteVote(request, env, Number(del[1]));
      }
      return json({ error: "Not found" }, 404);
    } catch (err) {
      console.error(err);
      return json({ error: "Something went wrong. Please try again." }, 500);
    }
  },
};

async function submitVote(request, env) {
  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid request." }, 400);
  }

  const machine = String(body.machine || "").toLowerCase();
  if (!SLUG.test(machine)) return json({ error: "Unknown machine." }, 400);

  // Every category needs an answer: 1-5, or "na" for "didn't try / don't know".
  const ratings = {};
  for (const key of CATEGORIES) {
    const raw = body.ratings?.[key];
    if (raw === "na") {
      ratings[key] = null;
      continue;
    }
    const value = Number(raw);
    if (!Number.isInteger(value) || value < 1 || value > 5) {
      return json({ error: "Please answer every category." }, 400);
    }
    ratings[key] = value;
  }

  if (!HAPPY.includes(body.happy)) {
    return json({ error: "Please answer the office machine question." }, 400);
  }
  // Capsule machines don't ask about beans, so no answer is fine.
  if (body.beans != null && !BEANS.includes(body.beans)) {
    return json({ error: "Please pick your preferred beans." }, 400);
  }

  const comment = String(body.comment || "").trim().slice(0, 500) || null;

  // The cookie wins over the id the page sends, so clearing localStorage
  // alone is not enough to vote again.
  const cookieId = readCookie(request, COOKIE);
  const bodyId = String(body.voterId || "");
  const voterId = VOTER_ID.test(cookieId || "")
    ? cookieId
    : VOTER_ID.test(bodyId)
      ? bodyId
      : crypto.randomUUID();
  const setCookie = `${COOKIE}=${voterId}; Max-Age=${ONE_YEAR}; Path=/; Secure; HttpOnly; SameSite=Lax`;

  const ip = request.headers.get("CF-Connecting-IP") || "";
  const ipHash = ip ? await sha256(`${ip}|caffienation`) : null;

  const maxPerIp = Number(env.MAX_VOTES_PER_IP || 0);
  if (maxPerIp > 0 && ipHash) {
    const row = await env.DB.prepare(
      "SELECT COUNT(*) AS n FROM votes WHERE machine = ? AND ip_hash = ?",
    )
      .bind(machine, ipHash)
      .first();
    if (row.n >= maxPerIp) {
      return json({ error: "Too many votes from this network.", alreadyVoted: true }, 409, setCookie);
    }
  }

  const result = await env.DB.prepare(
    `INSERT INTO votes (machine, voter_id, taste, milk, ease, speed, cleaning, overall, happy, beans, comment, ip_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (machine, voter_id) DO NOTHING`,
  )
    .bind(
      machine,
      voterId,
      ...CATEGORIES.map((key) => ratings[key]),
      body.happy,
      body.beans || null,
      comment,
      ipHash,
    )
    .run();

  if (result.meta.changes === 0) {
    return json({ error: "You already voted for this machine.", alreadyVoted: true }, 409, setCookie);
  }
  return json({ ok: true, voterId }, 201, setCookie);
}

// The admin password lives as a SHA-256 hash in the D1 settings table, so it
// never appears in this (public) repo. Change it with:
//   INSERT OR REPLACE INTO settings (key, value) VALUES ('admin_password_sha256', '<sha256 hex>');
async function isAdmin(request, env) {
  const password = request.headers.get("X-Admin-Password") || "";
  if (!password) return false;
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'admin_password_sha256'").first();
  if (!row) return false;
  return (await sha256(password, 32)) === row.value;
}

async function results(request, url, env) {
  if (!(await isAdmin(request, env))) {
    return json({ error: "Wrong password." }, 401);
  }

  const { results: machines } = await env.DB.prepare(
    "SELECT machine, COUNT(*) AS votes, MAX(created_at) AS last_vote FROM votes GROUP BY machine ORDER BY last_vote DESC",
  ).all();

  const requested = String(url.searchParams.get("m") || "").toLowerCase();
  const machine = SLUG.test(requested) ? requested : machines[0]?.machine;
  if (!machine) return json({ machines, machine: null });

  const { results: rows } = await env.DB.prepare(
    `SELECT id, ${CATEGORIES.join(", ")}, happy, beans, comment, created_at FROM votes WHERE machine = ? ORDER BY id DESC`,
  )
    .bind(machine)
    .all();

  const categories = {};
  for (const key of CATEGORIES) {
    const distribution = [0, 0, 0, 0, 0];
    let sum = 0;
    let skipped = 0;
    for (const row of rows) {
      if (row[key] === null) {
        skipped++;
        continue;
      }
      distribution[row[key] - 1]++;
      sum += row[key];
    }
    const rated = rows.length - skipped;
    categories[key] = { average: rated ? sum / rated : null, distribution, skipped };
  }

  const happy = { no: 0, okay: 0, yes: 0 };
  for (const row of rows) happy[row.happy]++;

  const beans = { red: 0, black: 0, any: 0 };
  for (const row of rows) if (row.beans) beans[row.beans]++;

  const comments = rows
    .filter((row) => row.comment)
    .slice(0, 200)
    .map((row) => ({ text: row.comment, happy: row.happy, overall: row.overall, at: row.created_at }));

  return json({ machines, machine, total: rows.length, categories, happy, beans, comments, votes: rows });
}

// Every machine side by side for the admin "All machines" tab, plus the last
// AI summary of the comments (cached in the settings table).
async function overview(request, env) {
  if (!(await isAdmin(request, env))) {
    return json({ error: "Wrong password." }, 401);
  }
  const avg = CATEGORIES.map((key) => `AVG(${key}) AS ${key}`).join(", ");
  const { results: rows } = await env.DB.prepare(
    `SELECT machine, COUNT(*) AS votes, ${avg},
       SUM(happy = 'yes') AS yes, SUM(happy = 'okay') AS okay, SUM(happy = 'no') AS no,
       SUM(beans = 'red') AS red, SUM(beans = 'black') AS black, SUM(beans = 'any') AS any_beans,
       SUM(comment IS NOT NULL) AS comments,
       MIN(created_at) AS first_vote, MAX(created_at) AS last_vote
     FROM votes GROUP BY machine ORDER BY first_vote`,
  ).all();

  const machines = rows.map((r) => ({
    machine: r.machine,
    votes: r.votes,
    averages: Object.fromEntries(CATEGORIES.map((key) => [key, r[key]])),
    happy: { yes: r.yes, okay: r.okay, no: r.no },
    beans: { red: r.red, black: r.black, any: r.any_beans },
    comments: r.comments,
    firstVote: r.first_vote,
    lastVote: r.last_vote,
  }));
  const commentCount = machines.reduce((n, m) => n + m.comments, 0);
  return json({ machines, commentCount, summary: await cachedSummary(env) });
}

async function cachedSummary(env) {
  const row = await env.DB.prepare("SELECT value FROM settings WHERE key = 'ai_summary'").first();
  try {
    return row ? JSON.parse(row.value) : null;
  } catch {
    return null;
  }
}

// Summarises every comment with Workers AI (free daily allowance). Only runs
// when the admin presses the button; the result is stored so page loads are free.
const AI_MODELS = ["@cf/meta/llama-3.3-70b-instruct-fp8-fast", "@cf/meta/llama-3.1-8b-instruct-fast"];

async function generateSummary(request, env) {
  if (!(await isAdmin(request, env))) {
    return json({ error: "Wrong password." }, 401);
  }
  if (!env.AI) return json({ error: "Workers AI is not set up for this site." }, 500);

  // The page sends the machine display names from machines.js.
  const body = await request.json().catch(() => ({}));
  const nameOf = (slug) => String(body.names?.[slug] || slug).slice(0, 60);

  const { results: rows } = await env.DB.prepare(
    "SELECT machine, overall, happy, comment FROM votes WHERE comment IS NOT NULL ORDER BY machine, id",
  ).all();
  if (!rows.length) return json({ error: "There are no comments to summarise yet." }, 400);

  const lines = rows.map((r) => `[${nameOf(r.machine)}] (overall ${r.overall ?? "n/a"}/5, happy as office machine: ${r.happy}) ${r.comment.replace(/\s+/g, " ")}`);
  const prompt = [
    "These are comments from office staff who tried coffee machines at demos. Each line starts with the machine name in brackets.",
    "Write a short, plain-English summary for the person choosing the office machine:",
    "1. One line per machine: what people liked and disliked (use the machine name as given).",
    "2. Themes that came up across machines.",
    "3. One sentence on which machine people seem to prefer and why.",
    "Keep it under 220 words. Use simple bullet points with '- '. Only use what the comments say.",
    "",
    "Comments:",
    ...lines,
  ].join("\n");

  let text = "";
  let model = "";
  let lastError;
  for (const candidate of AI_MODELS) {
    try {
      const out = await env.AI.run(candidate, {
        messages: [
          { role: "system", content: "You summarise feedback clearly and neutrally. You never invent details." },
          { role: "user", content: prompt },
        ],
        max_tokens: 600,
      });
      text = String(out?.response || "").trim();
      model = candidate;
      if (text) break;
    } catch (err) {
      lastError = err;
      console.error(candidate, err);
    }
  }
  if (!text) {
    return json({ error: `The AI summary failed${lastError ? ` (${lastError.message})` : ""}. Please try again later.` }, 502);
  }

  const summary = { text, model, commentCount: rows.length, generatedAt: new Date().toISOString() };
  await env.DB.prepare("INSERT OR REPLACE INTO settings (key, value) VALUES ('ai_summary', ?)")
    .bind(JSON.stringify(summary))
    .run();
  return json({ summary });
}

// Lets the vote page check whether this device already voted, so a vote
// deleted in the admin page frees the device to vote again.
async function status(request, url, env) {
  const machine = String(url.searchParams.get("m") || "").toLowerCase();
  const voterId = readCookie(request, COOKIE);
  if (!SLUG.test(machine) || !VOTER_ID.test(voterId || "")) return json({ voted: false });
  const row = await env.DB.prepare("SELECT 1 FROM votes WHERE machine = ? AND voter_id = ?").bind(machine, voterId).first();
  return json({ voted: Boolean(row) });
}

async function deleteVote(request, env, id) {
  if (!(await isAdmin(request, env))) {
    return json({ error: "Wrong password." }, 401);
  }
  const result = await env.DB.prepare("DELETE FROM votes WHERE id = ?").bind(id).run();
  return json({ ok: true, deleted: result.meta.changes });
}

function json(data, status = 200, setCookie) {
  const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };
  if (setCookie) headers["Set-Cookie"] = setCookie;
  return new Response(JSON.stringify(data), { status, headers });
}

function readCookie(request, name) {
  const header = request.headers.get("Cookie") || "";
  for (const part of header.split(";")) {
    const [key, ...rest] = part.trim().split("=");
    if (key === name) return rest.join("=");
  }
  return null;
}

async function sha256(text, bytes = 12) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)]
    .slice(0, bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
