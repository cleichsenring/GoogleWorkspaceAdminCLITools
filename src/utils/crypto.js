import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'crypto';
import { hostname, userInfo } from 'os';

const ALGORITHM = 'aes-256-gcm';

function deriveKey() {
  const material = `${hostname()}:${userInfo().username}:gws-tools`;
  return createHash('sha256').update(material).digest();
}

export function encrypt(plaintext) {
  const key = deriveKey();
  const iv = randomBytes(16);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  let ciphertext = cipher.update(plaintext, 'utf8', 'hex');
  ciphertext += cipher.final('hex');
  const tag = cipher.getAuthTag().toString('hex');

  return JSON.stringify({ iv: iv.toString('hex'), tag, ciphertext });
}

export function decrypt(json) {
  const key = deriveKey();
  const { iv, tag, ciphertext } = JSON.parse(json);

  const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(iv, 'hex'));
  decipher.setAuthTag(Buffer.from(tag, 'hex'));

  let plaintext = decipher.update(ciphertext, 'hex', 'utf8');
  plaintext += decipher.final('utf8');

  return plaintext;
}
