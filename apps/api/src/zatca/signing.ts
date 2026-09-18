import { p256 } from '@noble/curves/nist.js';

function pemToDer(pem: string, label: string) {
  const normalized = pem.replace(/\r?\n/g, '').trim();
  const begin = `-----BEGIN ${label}-----`;
  const end = `-----END ${label}-----`;
  if (!normalized.startsWith(begin) || !normalized.endsWith(end)) {
    throw new Error(`Invalid PEM: expected ${label}`);
  }
  const body = normalized.slice(begin.length, -end.length).replace(/\s+/g, '');
  const binary = atob(body);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function readDerLength(bytes: Uint8Array, offset: number) {
  const first = bytes[offset];
  if (first === undefined) throw new Error('Invalid DER length');
  if (first < 0x80) return { length: first, next: offset + 1 };
  const count = first & 0x7f;
  if (count === 0 || count > 4 || offset + count >= bytes.length) throw new Error('Invalid DER length');
  let length = 0;
  for (let i = 0; i < count; i++) length = (length << 8) | bytes[offset + 1 + i];
  return { length, next: offset + 1 + count };
}

function readDerElement(bytes: Uint8Array, offset: number) {
  const tag = bytes[offset];
  if (tag === undefined) throw new Error('Invalid DER element');
  const { length, next } = readDerLength(bytes, offset + 1);
  const end = next + length;
  if (end > bytes.length) throw new Error('Invalid DER element length');
  return { tag, valueStart: next, valueEnd: end, end };
}

function findOctetString(bytes: Uint8Array): Uint8Array | null {
  let offset = 0;
  while (offset < bytes.length) {
    const element = readDerElement(bytes, offset);
    if (element.tag === 0x04 && element.valueEnd - element.valueStart === 32) {
      return bytes.slice(element.valueStart, element.valueEnd);
    }
    if (element.tag === 0x30 || element.tag === 0x31 || (element.tag & 0xe0) === 0xa0) {
      const nested = findOctetString(bytes.slice(element.valueStart, element.valueEnd));
      if (nested) return nested;
    }
    offset = element.end;
  }
  return null;
}


function derLength(length: number) {
  if (length < 0x80) return Uint8Array.of(length);
  const bytes: number[] = [];
  let value = length;
  while (value > 0) {
    bytes.unshift(value & 0xff);
    value >>>= 8;
  }
  return Uint8Array.from([0x80 | bytes.length, ...bytes]);
}

function rawEcdsaToDer(raw: Uint8Array) {
  if (raw.length !== 64) throw new Error('Invalid P-256 ECDSA signature length');
  const integer = (value: Uint8Array) => {
    let start = 0;
    while (start < value.length - 1 && value[start] === 0) start++;
    let body = value.slice(start);
    if (body[0] & 0x80) {
      const prefixed = new Uint8Array(body.length + 1);
      prefixed[0] = 0;
      prefixed.set(body, 1);
      body = prefixed;
    }
    return body;
  };
  const r = integer(raw.slice(0, 32));
  const s = integer(raw.slice(32, 64));
  const body = new Uint8Array(2 + r.length + 2 + s.length);
  body[0] = 0x02; body[1] = r.length; body.set(r, 2);
  const sOffset = 2 + r.length;
  body[sOffset] = 0x02; body[sOffset + 1] = s.length; body.set(s, sOffset + 2);
  const length = derLength(body.length);
  const out = new Uint8Array(1 + length.length + body.length);
  out[0] = 0x30; out.set(length, 1); out.set(body, 1 + length.length);
  return out;
}

function extractCertificatePublicKeyInfo(der: Uint8Array) {
  const certificate = readDerElement(der, 0);
  const tbs = readDerElement(der, certificate.valueStart);
  let offset = tbs.valueStart;
  const first = readDerElement(der, offset);
  if (first.tag === 0xa0) offset = first.end;
  else offset = first.end;
  for (let i = 0; i < 5; i++) {
    const element = readDerElement(der, offset);
    offset = element.end;
  }
  const subjectPublicKeyInfo = readDerElement(der, offset);
  if (subjectPublicKeyInfo.tag !== 0x30) throw new Error('X.509 SubjectPublicKeyInfo not found');
  return der.slice(offset, subjectPublicKeyInfo.end);
}

function extractCertificateSignature(der: Uint8Array) {
  const outer = readDerElement(der, 0);
  if (outer.tag !== 0x30) throw new Error('Invalid X.509 certificate');
  let offset = outer.valueStart;
  const tbs = readDerElement(der, offset);
  offset = tbs.end;
  const algorithm = readDerElement(der, offset);
  offset = algorithm.end;
  const signature = readDerElement(der, offset);
  if (signature.tag !== 0x03 || signature.valueEnd <= signature.valueStart) {
    throw new Error('X.509 certificate signature not found');
  }
  const unusedBits = der[signature.valueStart];
  if (unusedBits !== 0) throw new Error('Unsupported X.509 signature bit string');
  return der.slice(signature.valueStart + 1, signature.valueEnd);
}

export function extractP256PrivateKey(privateKeyPem: string) {
  const labels = ['EC PRIVATE KEY', 'PRIVATE KEY'];
  let der: Uint8Array | null = null;
  for (const label of labels) {
    try {
      der = pemToDer(privateKeyPem, label);
      break;
    } catch {
      // Try the next supported PEM label.
    }
  }
  if (!der) throw new Error('Unsupported private key PEM format');
  const secret = findOctetString(der);
  if (!secret || secret.length !== 32 || !p256.utils.isValidSecretKey(secret)) {
    throw new Error('Private key is not a valid p256 key');
  }
  return secret;
}

export function buildZatcaQrCryptography(input: {
  privateKeyPem: string;
  certificatePem: string;
  signedTlvPayload: Uint8Array;
}) {
  const privateKey = extractP256PrivateKey(input.privateKeyPem);
  const certificateDer = pemToDer(input.certificatePem, 'CERTIFICATE');
  const publicKey = extractCertificatePublicKeyInfo(certificateDer);
  const signature = rawEcdsaToDer(new Uint8Array(p256.sign(input.signedTlvPayload, privateKey, { prehash: false })));
  const certificateSignature = extractCertificateSignature(certificateDer);
  return { signature, publicKey, certificateSignature };
}

export function validateZatcaSigningMaterial(privateKeyPem: string, certificatePem: string) {
  const privateKey = extractP256PrivateKey(privateKeyPem);
  const certificateDer = pemToDer(certificatePem, 'CERTIFICATE');
  const publicKey = extractCertificatePublicKeyInfo(certificateDer);
  const certificateSignature = extractCertificateSignature(certificateDer);
  return {
    curve: 'p256' as const,
    privateKeyBytes: privateKey.length,
    publicKeyBytes: publicKey.length,
    certificateSignatureBytes: certificateSignature.length,
  };
}
