# Oxinab catalogue app

Installable catalogue (`/`), command center (`/admin`), driver app (`/driver`) and sales app (`/sales`), hosted on Vercel.

Sales app: accounts are made in the command center's Sales team tab (phone number, PIN, monthly target, discount limit, and a switch for each feature). Reps keep clients and leads, check in and out at visits, make offers that become a numbered proforma (same PF-YYYY-NNNN series) or an order in the normal order log, and plan visit routes on a map. If you add the domain `oxinab-sales.vercel.app` to the project, it opens the sales app directly.

Storage, connected in Vercel:
- **Vercel Blob** (`BLOB_READ_WRITE_TOKEN`): catalogue, photos, orders (encrypted), proformas.
- **Upstash Redis** (`KV_REST_API_URL`, `KV_REST_API_TOKEN`): live order progress, drivers, and drivers' locations for the live map.

Settings the owner sets in Vercel: `ADMIN_PASSWORD`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `ANTHROPIC_API_KEY` (Claude reads the competitor pro-formas clients upload with "Compare a pro-forma"; without it only Excel and CSV files are read, and PDFs and photos are still kept for the Competitor prices tab).
