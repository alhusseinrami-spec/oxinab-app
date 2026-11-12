// Drivers: name, phone, PIN (stored only as a salted hash) and whether they may sign in.
import { scryptSync, randomBytes, timingSafeEqual } from "node:crypto";
import { getState, setState } from "./_orders.js";

export const normPhone = (p) => String(p || "").replace(/\D/g, "").replace(/^00/, "").replace(/^961/, "").replace(/^0+/, "");
export const pinVer = (d) => d.hash.slice(0, 10);
export function hashPin(pin) { const salt = randomBytes(12).toString("hex"); return { salt, hash: scryptSync(String(pin), salt, 32).toString("hex") }; }
export function checkPin(d, pin) {
  if (!d || !d.hash) return false;
  const a = scryptSync(String(pin || ""), d.salt, 32), b = Buffer.from(d.hash, "hex");
  return a.length === b.length && timingSafeEqual(a, b);
}
export const loadDrivers = async () => (await getState("drivers")) || [];
export const saveDrivers = (list) => setState("drivers", list);
// What the command center may see: never the PIN hash.
export const publicDriver = ({ id, n, tel, on }) => ({ id, n, tel, on: !!on });
