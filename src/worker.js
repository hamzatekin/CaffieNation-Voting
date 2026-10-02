// CaffieNation voting API. Static files in /public are served by Cloudflare
// directly; only /api/* reaches this Worker.

const CATEGORIES = ["taste", "milk", "ease", "speed", "cleaning", "overall"];
const HAPPY = ["no", "okay", "yes"];
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
        return await results(url, env);
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

  const ratings = {};
  for (const key of CATEGORIES) {
    const value = Number(body.ratings?.[key]);
    if (!Number.isInteger(value) || value < 1 || value > 5) {
      return json({ error: "Please rate every category." }, 400);
    }
    ratings[key] = value;
  }

  if (!HAPPY.includes(body.happy)) {
    return json({ error: "Please answer the office machine question." }, 400);
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
    `INSERT INTO votes (machine, voter_id, taste, milk, ease, speed, cleaning, overall, happy, comment, ip_hash)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (machine, voter_id) DO NOTHING`,
  )
    .bind(
      machine,
      voterId,
      ...CATEGORIES.map((key) => ratings[key]),
      body.happy,
      comment,
      ipHash,
    )
    .run();

  if (result.meta.changes === 0) {
    return json({ error: "You already voted for this machine.", alreadyVoted: true }, 409, setCookie);
  }
  return json({ ok: true, voterId }, 201, setCookie);
}

async function results(url, env) {
  if (env.RESULTS_KEY && url.searchParams.get("key") !== env.RESULTS_KEY) {
    return json({ error: "This page needs the results key." }, 401);
  }

  const { results: machines } = await env.DB.prepare(
    "SELECT machine, COUNT(*) AS votes, MAX(created_at) AS last_vote FROM votes GROUP BY machine ORDER BY last_vote DESC",
  ).all();

  const requested = String(url.searchParams.get("m") || "").toLowerCase();
  const machine = SLUG.test(requested) ? requested : machines[0]?.machine;
  if (!machine) return json({ machines, machine: null });

  const { results: rows } = await env.DB.prepare(
    `SELECT ${CATEGORIES.join(", ")}, happy, comment, created_at FROM votes WHERE machine = ? ORDER BY created_at DESC`,
  )
    .bind(machine)
    .all();

  const categories = {};
  for (const key of CATEGORIES) {
    const distribution = [0, 0, 0, 0, 0];
    let sum = 0;
    for (const row of rows) {
      distribution[row[key] - 1]++;
      sum += row[key];
    }
    categories[key] = { average: rows.length ? sum / rows.length : 0, distribution };
  }

  const happy = { no: 0, okay: 0, yes: 0 };
  for (const row of rows) happy[row.happy]++;

  const comments = rows
    .filter((row) => row.comment)
    .slice(0, 200)
    .map((row) => ({ text: row.comment, happy: row.happy, overall: row.overall, at: row.created_at }));

  return json({ machines, machine, total: rows.length, categories, happy, comments });
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

async function sha256(text) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(text));
  return [...new Uint8Array(digest)]
    .slice(0, 12)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}
