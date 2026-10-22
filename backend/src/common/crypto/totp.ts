import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';

const BASE32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
const STEP_SECONDS = 30;
const DIGITS = 6;
// Принимаем предыдущий и следующий шаг: часы на телефоне почти всегда врут
// на десяток секунд, а ученик вводит код не мгновенно.
const WINDOW = 1;

function base32Encode(buffer: Buffer): string {
  let bits = 0;
  let value = 0;
  let output = '';
  for (const byte of buffer) {
    value = (value << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      output += BASE32[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32[(value << (5 - bits)) & 31];
  }
  return output;
}

function base32Decode(input: string): Buffer {
  const clean = input.toUpperCase().replace(/=+$/, '').replace(/\s/g, '');
  let bits = 0;
  let value = 0;
  const bytes: number[] = [];
  for (const char of clean) {
    const index = BASE32.indexOf(char);
    if (index === -1) {
      throw new Error('Некорректный секрет TOTP');
    }
    value = (value << 5) | index;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/** 20 байт энтропии — как рекомендует RFC 4226 для HMAC-SHA1. */
export function generateTotpSecret(): string {
  return base32Encode(randomBytes(20));
}

function hotp(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeBigUInt64BE(BigInt(counter));
  const digest = createHmac('sha1', secret).update(buf).digest();
  const offset = digest[digest.length - 1] & 0x0f;
  const binary =
    ((digest[offset] & 0x7f) << 24) |
    ((digest[offset + 1] & 0xff) << 16) |
    ((digest[offset + 2] & 0xff) << 8) |
    (digest[offset + 3] & 0xff);
  return String(binary % 10 ** DIGITS).padStart(DIGITS, '0');
}

export function generateTotp(secret: string, at: number = Date.now()): string {
  return hotp(base32Decode(secret), Math.floor(at / 1000 / STEP_SECONDS));
}

export function verifyTotp(secret: string, token: string, at: number = Date.now()): boolean {
  const clean = token.replace(/\D/g, '');
  if (clean.length !== DIGITS) {
    return false;
  }
  const key = base32Decode(secret);
  const counter = Math.floor(at / 1000 / STEP_SECONDS);
  const provided = Buffer.from(clean);
  for (let drift = -WINDOW; drift <= WINDOW; drift += 1) {
    const candidate = Buffer.from(hotp(key, counter + drift));
    if (candidate.length === provided.length && timingSafeEqual(candidate, provided)) {
      return true;
    }
  }
  return false;
}

/** Ссылка otpauth:// — из неё фронтенд рисует QR для Google Authenticator. */
export function buildOtpauthUrl(secret: string, login: string, issuer: string): string {
  const label = encodeURIComponent(`${issuer}:${login}`);
  const params = new URLSearchParams({
    secret,
    issuer,
    algorithm: 'SHA1',
    digits: String(DIGITS),
    period: String(STEP_SECONDS),
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
