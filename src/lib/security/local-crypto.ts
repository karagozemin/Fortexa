import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";

function getRawKey() {
  const envKey = process.env.FORTEXA_LOCAL_ENC_KEY;
  if (!envKey) {
    throw new Error("FORTEXA_LOCAL_ENC_KEY is required for local custodial secret encryption.");
  }

  const normalized = envKey.trim();

  try {
    const decoded = Buffer.from(normalized, "base64");
    if (decoded.length >= 32) {
      return decoded.subarray(0, 32);
    }
  } catch {
    // fallback to hash path
  }

  return createHash("sha256").update(normalized).digest();
}

export function encryptLocalSecret(plainText: string) {
  const key = getRawKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);

  const encrypted = Buffer.concat([cipher.update(plainText, "utf8"), cipher.final()]);
  const authTag = cipher.getAuthTag();

  return `${iv.toString("base64")}:${encrypted.toString("base64")}:${authTag.toString("base64")}`;
}

export function decryptLocalSecret(payload: string) {
  const [ivEncoded, encryptedEncoded, tagEncoded] = payload.split(":");

  if (!ivEncoded || !encryptedEncoded || !tagEncoded) {
    throw new Error("Invalid encrypted secret format.");
  }

  const key = getRawKey();
  const iv = Buffer.from(ivEncoded, "base64");
  const encrypted = Buffer.from(encryptedEncoded, "base64");
  const authTag = Buffer.from(tagEncoded, "base64");

  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(authTag);

  const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
  return decrypted.toString("utf8");
}
