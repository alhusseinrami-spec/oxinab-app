import { json } from "../_lib.js";
export function GET() {
  return json({ key: process.env.VAPID_PUBLIC_KEY || null }, 200, { "cache-control": "public, max-age=60" });
}
