import { pbkdf2, randomBytes, timingSafeEqual } from "crypto";
import { promisify } from "util";

const pbkdf2Async = promisify(pbkdf2);
const iterations = 210_000;
const keyLength = 32;
const digest = "sha256";

export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString("hex");
  const derived = await pbkdf2Async(password, salt, iterations, keyLength, digest);
  return `pbkdf2$${iterations}$${salt}$${derived.toString("hex")}`;
}

export async function verifyPassword(password: string, storedHash: string | null | undefined) {
  if (!storedHash) {
    return false;
  }

  const [algorithm, iterationText, salt, hash] = storedHash.split("$");
  if (algorithm !== "pbkdf2" || !iterationText || !salt || !hash) {
    return false;
  }

  const derived = await pbkdf2Async(password, salt, Number(iterationText), keyLength, digest);
  const expected = Buffer.from(hash, "hex");

  return expected.length === derived.length && timingSafeEqual(expected, derived);
}
