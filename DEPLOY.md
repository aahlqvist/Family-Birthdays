# Deploying the Family Birthdays Worker

## What this does
The Cloudflare Worker gives every family a private cloud slot identified by
a short code (e.g. `ABCD-EFGH-JKLM`).  All devices that share the same code
read and write the same data in real time.

---

## Prerequisites
- A free [Cloudflare account](https://dash.cloudflare.com/sign-up)
- Node.js ≥ 18 installed

---

## Steps

### 1 — Install Wrangler CLI
```bash
npm install -g wrangler
```

### 2 — Log in to Cloudflare
```bash
wrangler login
```
A browser window opens; approve access.

### 3 — Create a KV namespace
```bash
wrangler kv namespace create FAMILY_DATA
```
Copy the `id` that is printed, e.g.:
```
{ binding = "FAMILY_DATA", id = "abc123def456..." }
```

### 4 — Paste the ID into wrangler.toml
Open `wrangler.toml` and replace `PASTE_KV_NAMESPACE_ID_HERE` with your id:
```toml
[[kv_namespaces]]
binding = "FAMILY_DATA"
id      = "abc123def456..."
```

### 5 — Deploy the Worker
```bash
wrangler deploy
```
Wrangler prints your Worker URL:
```
https://family-birthdays.<your-subdomain>.workers.dev
```

### 6 — Paste the URL into index.html
Open `index.html` and find this line near the top of the `<script>` block:
```js
const WORKER_URL = '';
```
Replace the empty string with your Worker URL:
```js
const WORKER_URL = 'https://family-birthdays.<your-subdomain>.workers.dev';
```
Save the file.  That's it — the app now syncs across all devices.

---

## Sharing with family
1. Open the app and click **🏠 Family** in the header (it appears once a
   Worker URL is set).
2. Choose **New family** — a unique code like `ABCD-EFGH-JKLM` is generated.
3. Share that code with family members.
4. Each person opens the app, clicks **🏠 Family → Join family**, and enters
   the code.
5. Everyone immediately sees the same data; edits sync within ~2 seconds.

---

## Keeping it updated
To push new app code to GitHub Pages just upload the updated `index.html`.
The Worker is separate — you only need to redeploy it if you change
`worker.js`.

---

## Free-tier limits
Cloudflare's free tier includes:
- 100,000 Worker requests / day
- 1 GB KV storage

For a private family app this is effectively unlimited.
