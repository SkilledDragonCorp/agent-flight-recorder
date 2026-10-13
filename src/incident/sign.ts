import {
  generateKeyPairSync,
  createPrivateKey,
  createPublicKey,
  sign,
  verify,
} from "node:crypto";
import { mkdirSync, writeFileSync, readFileSync, existsSync, chmodSync } from "node:fs";
import { join } from "node:path";

export interface KeyPairPaths {
  privateKeyPath: string;
  publicKeyPath: string;
}

export function keygen(home: string): KeyPairPaths {
  const dir = join(home, "keys");
  mkdirSync(dir, { recursive: true });
  const { privateKey, publicKey } = generateKeyPairSync("ed25519");
  const privateKeyPath = join(dir, "ed25519.pem");
  const publicKeyPath = join(dir, "ed25519.pub.pem");
  writeFileSync(
    privateKeyPath,
    privateKey.export({ type: "pkcs8", format: "pem" }),
    { mode: 0o600 },
  );
  writeFileSync(
    publicKeyPath,
    publicKey.export({ type: "spki", format: "pem" }),
  );
  chmodSync(privateKeyPath, 0o600);
  return { privateKeyPath, publicKeyPath };
}

export function signBytes(home: string, data: Buffer | string): Buffer {
  const pem = readFileSync(join(home, "keys", "ed25519.pem"), "utf8");
  const key = createPrivateKey(pem);
  return sign(null, Buffer.isBuffer(data) ? data : Buffer.from(data), key);
}

export function verifyBytes(
  publicKeyPem: string,
  data: Buffer | string,
  signature: Buffer,
): boolean {
  const key = createPublicKey(publicKeyPem);
  return verify(
    null,
    Buffer.isBuffer(data) ? data : Buffer.from(data),
    key,
    signature,
  );
}

export function hasKeys(home: string): boolean {
  return existsSync(join(home, "keys", "ed25519.pem"));
}
