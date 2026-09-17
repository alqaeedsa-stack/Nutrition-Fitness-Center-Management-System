const ITERATIONS = 100_000;
const KEY_LENGTH = 32;
const SALT_LENGTH = 16;

function toHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, '0')).join('');
}

function fromHex(value: string) {
  if (!/^[0-9a-f]+$/i.test(value) || value.length % 2 !== 0) {
    throw new Error('Invalid hex value');
  }
  return new Uint8Array(value.match(/.{2}/g)!.map((byte) => Number.parseInt(byte, 16)));
}

async function derive(password: string, salt: Uint8Array, iterations: number) {
  const material = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(password),
    'PBKDF2',
    false,
    ['deriveBits'],
  );

  const saltBufferSource = salt as unknown as BufferSource;

  const bits = await crypto.subtle.deriveBits(
    { name: 'PBKDF2', salt: saltBufferSource, iterations, hash: 'SHA-256' },
    material,
    KEY_LENGTH * 8,
  );

  return new Uint8Array(bits);
}

function timingSafeEqual(a: Uint8Array, b: Uint8Array) {
  if (a.length !== b.length) return false;
  let difference = 0;
  for (let index = 0; index < a.length; index += 1) {
    difference |= a[index] ^ b[index];
  }
  return difference === 0;
}

export async function hashPassword(password: string) {
  if (password.length < 10) throw new Error('Password must be at least 10 characters');

  const salt = crypto.getRandomValues(new Uint8Array(SALT_LENGTH));
  const derived = await derive(password, salt, ITERATIONS);
  return `pbkdf2-sha256$${ITERATIONS}$${toHex(salt)}$${toHex(derived)}`;
}

export async function verifyPassword(password: string, encoded: string) {
  const [algorithm, iterationsValue, saltHex, hashHex] = encoded.split('$');
  const iterations = Number.parseInt(iterationsValue, 10);

  if (algorithm !== 'pbkdf2-sha256' || !Number.isSafeInteger(iterations) || iterations < 100_000 || iterations > 100_000) {
    return false;
  }

  try {
    const expected = fromHex(hashHex);
    const actual = await derive(password, fromHex(saltHex), iterations);
    return timingSafeEqual(actual, expected);
  } catch {
    return false;
  }
}
