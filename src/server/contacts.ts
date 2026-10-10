import "server-only";
import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";
import { contactSchema } from "@/domain/validation";
import { AppError } from "./errors";
function key() {
  const encoded = process.env.CONTACT_ENCRYPTION_KEY ?? "";
  const bytes = Buffer.from(encoded, "base64");
  const id = process.env.CONTACT_KEY_ID ?? "";
  if (bytes.length !== 32 || bytes.toString("base64") !== encoded || !/^[A-Za-z0-9._-]{1,40}$/.test(id)) throw new AppError(503, "Contact encryption is unavailable. Ask the operator to check the key configuration.");
  return { bytes, id };
}
export function encryptPrivate(binding: string, value: unknown) {
  const configured = key();
  const nonce = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", configured.bytes, nonce);
  cipher.setAAD(Buffer.from(binding + ":" + configured.id));
  const ciphertext = Buffer.concat([cipher.update(JSON.stringify(value), "utf8"), cipher.final()]);
  return { keyId: configured.id, ciphertext: [nonce, cipher.getAuthTag(), ciphertext].map(v => v.toString("base64")).join(".") };
}
export function decryptPrivate(binding: string, encrypted: { keyId: string; ciphertext: string }): unknown {
  const configured = key();
  if (configured.id !== encrypted.keyId) throw new AppError(503, "This contact requires its original encryption key.");
  try {
    const [nonce, tag, value] = encrypted.ciphertext.split(".").map(v => Buffer.from(v, "base64"));
    const decipher = createDecipheriv("aes-256-gcm", configured.bytes, nonce);
    decipher.setAAD(Buffer.from(binding + ":" + encrypted.keyId));
    decipher.setAuthTag(tag);
    return JSON.parse(Buffer.concat([decipher.update(value), decipher.final()]).toString("utf8"));
  } catch { throw new AppError(503, "This contact could not be decrypted."); }
}
export function encryptContact(profileId: string, value: unknown) { return encryptPrivate(profileId, contactSchema.parse(value)); }
export function decryptContact(profileId: string, encrypted: { keyId: string; ciphertext: string }) { return contactSchema.parse(decryptPrivate(profileId, encrypted)); }
