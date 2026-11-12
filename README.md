# Oxinab catalogue app

Installable catalogue (`/`), command center (`/admin`) and driver app (`/driver`), hosted on Vercel.

Storage, connected in Vercel:
- **Vercel Blob** (`BLOB_READ_WRITE_TOKEN`): catalogue, photos, orders (encrypted), proformas.
- **Upstash Redis** (`KV_REST_API_URL`, `KV_REST_API_TOKEN`): live order progress, drivers, and drivers' locations for the live map.

Settings the owner sets in Vercel: `ADMIN_PASSWORD`, `VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`.
