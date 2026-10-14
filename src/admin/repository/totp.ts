/**
 * Time-based one-time codes (RFC 6238, SHA-1, 6 digits, 30 s) for demo mode only, so a
 * code from a real authenticator app scanned off the demo QR is accepted too.
 * Production codes are checked by Supabase Auth, never by this file.
 */

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Decode(input: string): Uint8Array {
  const clean = input.replace(/[\s=]/g, '').toUpperCase();
  let bits = 0;
  let value = 0;
  const out: number[] = [];
  for (const ch of clean) {
    const idx = BASE32.indexOf(ch);
    if (idx < 0) throw new Error(`Invalid base32 character "${ch}"`);
    value = (value << 5) | idx;
    bits += 5;
    if (bits >= 8) {
      out.push((value >>> (bits - 8)) & 0xff);
      bits -= 8;
    }
  }
  return new Uint8Array(out);
}

export async function hotp(key: Uint8Array, counter: number, digits = 6): Promise<string> {
  const msg = new ArrayBuffer(8);
  const view = new DataView(msg);
  view.setUint32(0, Math.floor(counter / 2 ** 32));
  view.setUint32(4, counter >>> 0);
  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    key as BufferSource,
    { name: 'HMAC', hash: 'SHA-1' },
    false,
    ['sign'],
  );
  const mac = new Uint8Array(await crypto.subtle.sign('HMAC', cryptoKey, msg));
  const offset = mac[mac.length - 1]! & 0x0f;
  const bin =
    ((mac[offset]! & 0x7f) << 24) | (mac[offset + 1]! << 16) | (mac[offset + 2]! << 8) | mac[offset + 3]!;
  return String(bin % 10 ** digits).padStart(digits, '0');
}

/** Code for a base32 secret at a given time (ms). */
export function totp(secret: string, atMs = Date.now(), digits = 6): Promise<string> {
  return hotp(base32Decode(secret), Math.floor(atMs / 1000 / 30), digits);
}

/** Accepts the current code and one step either side (clock drift). */
export async function verifyTotp(secret: string, code: string, atMs = Date.now()): Promise<boolean> {
  const c = code.trim();
  if (!/^\d{6}$/.test(c)) return false;
  for (const step of [-1, 0, 1]) {
    if ((await totp(secret, atMs + step * 30_000)) === c) return true;
  }
  return false;
}
