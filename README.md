# CaffieNation Voting ☕

A small, mobile-first voting site for the office coffee machine demos.
People scan a QR code, rate the machine on six categories (1 to 5), answer
"Would you be happy if this became our office machine?", and can leave a comment.

- `/` is the vote page for today's machine (the Rijo42 avari B20); `/?m=<slug>` picks another machine
- Machines (photo, link, red-beans note) are listed in `public/machines.js`; add one there before its demo
- `/admin` (password protected) shows live results per machine, every vote and comment, a CSV download, and makes the QR codes

Everything runs free on Cloudflare: the pages are static files and the votes
live in a D1 (SQLite) database behind a tiny Worker (`src/worker.js`).

## Setup (about 5 minutes)

You need a free Cloudflare account and Node 18+.

```bash
npm install
npx wrangler login
npx wrangler d1 create caffienation-votes   # copy the database_id it prints
# paste that id into wrangler.jsonc ("database_id")
npm run db:init                             # creates the votes table
npm run deploy                              # prints your https://caffienation-voting.<you>.workers.dev URL
```

Then set an admin password (below), open `https://<your-url>/admin`, type the machine name, and press
**Make QR** (or **Show big for the demo** to put it full screen on a laptop or TV).

To deploy automatically on every push, connect this repo in the Cloudflare
dashboard under Workers & Pages → your worker → Settings → Builds.

Local testing: `npm run db:init:local && npm run dev`, then open http://localhost:8787.

### Optional settings (in `wrangler.jsonc` → `vars`)

| Setting | What it does |
| --- | --- |
| `MAX_VOTES_PER_IP` | Caps votes per network per machine. Leave at `0` for office Wi-Fi, where everyone shares one public IP. |

## Admin password

The password is stored as a SHA-256 hash in the database's `settings` table,
so it never ends up in this public repo. To set or change it:

```bash
HASH=$(printf %s 'your-new-password' | sha256sum | cut -d' ' -f1)
npx wrangler d1 execute caffienation-votes --remote --command \
  "INSERT OR REPLACE INTO settings (key, value) VALUES ('admin_password_sha256', '$HASH')"
```

## How "one vote per person" works

Two cheap layers:

1. **The browser remembers.** After voting, the page stores a flag in `localStorage`
   and shows "You've already voted" when the person opens the link again.
2. **The server enforces it.** Each device gets a random ID, kept in `localStorage`
   and in a long-lived HttpOnly cookie. The database has
   `UNIQUE(machine, voter_id)`, so a second vote from the same device for the
   same machine is rejected, even if someone clears localStorage.

What it does not stop: someone opening a private/incognito window or using a
second phone. For a friendly office demo that is usually fine.

If you need it airtight, the next step is **one-time codes**: print a short code
(or a personal QR) per attendee, and the server accepts each code once. That
stops repeat votes completely but costs a bit of prep before each demo.

Blocking by IP address is deliberately off by default, because everyone on the
office Wi-Fi shows up with the same IP and would block each other.

## Photos

Photos are loaded from [Unsplash](https://unsplash.com) (free to use under the
Unsplash License). If one fails to load, a coffee-colored gradient shows instead.
