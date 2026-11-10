const encoder = new TextEncoder();

function bytesToBase64(bytes) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary);
}

function base64ToBytes(value) {
  const binary = atob(value);
  return Uint8Array.from(binary, char => char.charCodeAt(0));
}

export async function hashPassword(password, salt = crypto.getRandomValues(new Uint8Array(16))) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt, iterations: 120000, hash: "SHA-256" },
    key,
    256
  );
  return `pbkdf2$120000$${bytesToBase64(salt)}$${bytesToBase64(new Uint8Array(bits))}`;
}

export async function verifyPassword(password, stored) {
  const [, iterations, saltValue, expectedValue] = String(stored).split("$");
  if (!iterations || !saltValue || !expectedValue) return false;
  const key = await crypto.subtle.importKey("raw", encoder.encode(password), "PBKDF2", false, ["deriveBits"]);
  const bits = await crypto.subtle.deriveBits(
    { name: "PBKDF2", salt: base64ToBytes(saltValue), iterations: Number(iterations), hash: "SHA-256" },
    key,
    256
  );
  const actual = bytesToBase64(new Uint8Array(bits));
  return actual === expectedValue;
}

export function randomToken() {
  return `${crypto.randomUUID()}${crypto.randomUUID().replaceAll("-", "")}`;
}

export async function hashToken(value) {
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(value));
  return bytesToBase64(new Uint8Array(digest));
}
