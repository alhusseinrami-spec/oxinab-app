# Oxinab catalogue app

Installable catalogue (`/`), command center (`/admin`) and driver app (`/driver`), hosted on Vercel.

Storage, connected in Vercel:
- **Vercel Blob** (`BLOB_READ_WRITE_TOKEN`): catalogue, photos, orders (encrypted), proformas.
- **Upstash Redis** (`KV_REST_API_URL`, `KV_REST_API_TOKEN`): live order progress, drivers, and drivers' locations for the live map.

Settings the owner sets in Vercel: `ADMIN_PASSWORD`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, and `ANTHROPIC_API_KEY` (Claude reads the competitor pro-formas clients upload with "Compare a pro-forma"; without it only Excel and CSV files are read, and PDFs and photos are still kept for the Competitor prices tab).
