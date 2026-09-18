import { secp256k1 } from '@noble/curves/secp256k1.js';

function pemToDer(pem: string, label: string) {
  const normalized = pem.replace(/\\r?\\n/g, '').trim();
  const begin = `-----BEGIN ${label}-----`;
  const end = `-----END ${label}-----`;
  if (!normalized.startsWith(begin) || !normalized.endsWith(end)) {
    throw new Error(`Invalid PEM: expected ${label}`);
  }
  const body = normalized.slice(begin.length, -end.length).replace(/\\s+/g, '');
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

export function extractSecp256k1PrivateKey(privateKeyPem: string) {
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
  if (!secret || secret.length !== 32 || !secp256k1.utils.isValidSecretKey(secret)) {
    throw new Error('Private key is not a valid secp256k1 key');
  }
  return secret;
}

export function buildZatcaQrCryptography(input: {
  privateKeyPem: string;
  certificatePem: string;
  signedTlvPayload: Uint8Array;
}) {
  const privateKey = extractSecp256k1PrivateKey(input.privateKeyPem);
  const signature = secp256k1.sign(input.signedTlvPayload, privateKey).toBytes();
  const publicKey = secp256k1.getPublicKey(privateKey, false).slice(1);
  const certificateSignature = extractCertificateSignature(pemToDer(input.certificatePem, 'CERTIFICATE'));
  return { signature, publicKey, certificateSignature };
}

export function validateZatcaSigningMaterial(privateKeyPem: string, certificatePem: string) {
  const privateKey = extractSecp256k1PrivateKey(privateKeyPem);
  const publicKey = secp256k1.getPublicKey(privateKey, false).slice(1);
  const certificateSignature = extractCertificateSignature(pemToDer(certificatePem, 'CERTIFICATE'));
  return {
    curve: 'secp256k1' as const,
    privateKeyBytes: privateKey.length,
    publicKeyBytes: publicKey.length,
    certificateSignatureBytes: certificateSignature.length,
  };
}
