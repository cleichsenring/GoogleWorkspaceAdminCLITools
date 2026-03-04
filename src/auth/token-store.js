import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync } from 'fs';
import { dirname } from 'path';
import { encrypt, decrypt } from '../utils/crypto.js';

const TOKEN_PATH = 'data/tokens.enc';

export function saveTokens(tokens) {
  const dir = dirname(TOKEN_PATH);
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });

  const encrypted = encrypt(JSON.stringify(tokens));
  writeFileSync(TOKEN_PATH, encrypted, 'utf8');
}

export function loadTokens() {
  if (!existsSync(TOKEN_PATH)) return null;

  const encrypted = readFileSync(TOKEN_PATH, 'utf8');
  const json = decrypt(encrypted);
  return JSON.parse(json);
}

export function tokensExist() {
  return existsSync(TOKEN_PATH);
}

export function clearTokens() {
  if (existsSync(TOKEN_PATH)) {
    unlinkSync(TOKEN_PATH);
  }
}
