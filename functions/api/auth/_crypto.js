import { pbkdf2Sync, timingSafeEqual } from "node:crypto";

const ITERATIONS = 100000;
const LEGACY_ITERATIONS = 120000;
const encoder = new TextEncoder();

function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value) {
  return Uint8Array.from(atob(value), char => char.charCodeAt(0));
}

function derivePassword(password, salt, iterations) {
  return pbkdf2Sync(password, salt, iterations, 32, "sha256");
}

export async function hashPassword(password, salt = crypto.getRandomValues(new Uint8Array(16))) {
  const hash = derivePassword(password, salt, ITERATIONS);
  return `pbkdf2-v2$${ITERATIONS}$${bytesToBase64(salt)}$${bytesToBase64(hash)}`;
}

export async function verifyPassword(password, stored) {
  const [format, iterationValue, saltValue, expectedValue] = String(stored).split("$");
  const iterations = Number(iterationValue);
  if (!saltValue || !expectedValue) return false;
  if (format === "pbkdf2-v2" ? iterations !== ITERATIONS :
    format !== "pbkdf2" || ![ITERATIONS, LEGACY_ITERATIONS].includes(iterations)) return false;

  let salt, expected;
  try {
    salt = base64ToBytes(saltValue);
    expected = base64ToBytes(expectedValue);
  } catch {
    return false;
  }
  if (salt.length !== 16 || expected.length !== 32) return false;
  if (timingSafeEqual(derivePassword(password, salt, iterations), expected)) return true;

  // One previous release wrote 100000 in the record after deriving at 120000.
  return format === "pbkdf2" && iterations === ITERATIONS &&
    timingSafeEqual(derivePassword(password, salt, LEGACY_ITERATIONS), expected);
}

export function randomToken() {
  return `${crypto.randomUUID()}${crypto.randomUUID().replaceAll("-", "")}`;
}

export async function hashToken(value) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return bytesToBase64(new Uint8Array(digest));
}
