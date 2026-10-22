import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

interface ScryptParams {
  N: number;
  r: number;
  p: number;
  maxmem: number;
}

const scryptAsync = promisify(scrypt) as (
  password: string,
  salt: Buffer,
  keylen: number,
  options: ScryptParams,
) => Promise<Buffer>;

// Параметры подобраны так, чтобы хеш считался ~100 мс на типовом VPS.
// maxmem задан явно: N=2^15 при r=8 требует ровно 32 МиБ (128 * N * r),
// а это и есть предел Node по умолчанию — без запаса вызов падает.
const PARAMS: ScryptParams = { N: 2 ** 15, r: 8, p: 1, maxmem: 96 * 1024 * 1024 };
const KEY_LENGTH = 64;
const SALT_LENGTH = 16;

// scrypt входит в состав Node — обходимся без нативных сборок bcrypt/argon2,
// поэтому образ собирается на любой машине без компилятора.
export async function hashSecret(secret: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  const key = await scryptAsync(secret.normalize('NFKC'), salt, KEY_LENGTH, PARAMS);
  return ['scrypt', PARAMS.N, PARAMS.r, PARAMS.p, salt.toString('base64'), key.toString('base64')].join('$');
}

export async function verifySecret(secret: string, stored: string): Promise<boolean> {
  const parts = stored.split('$');
  if (parts.length !== 6 || parts[0] !== 'scrypt') {
    return false;
  }
  const [, n, r, p, saltB64, keyB64] = parts;
  const salt = Buffer.from(saltB64, 'base64');
  const expected = Buffer.from(keyB64, 'base64');
  const actual = await scryptAsync(secret.normalize('NFKC'), salt, expected.length, {
    N: Number(n),
    r: Number(r),
    p: Number(p),
    maxmem: PARAMS.maxmem,
  });
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
