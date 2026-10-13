#!/usr/bin/env node
// Encrypted team secrets for SCL.
//   npm run secrets:lock   → encrypts the keys in .env.local into secrets/env.enc (safe to commit)
//   npm run unlock         → decrypts secrets/env.enc into .env.local (asks for the team password)
// Crypto: scrypt (N=2^15, r=8, p=1) → 256-bit key, AES-256-GCM with random salt and IV. Without the password the file
// is useless; with a wrong password decryption fails (authenticated encryption), nothing is written.
// Non-interactive use (e.g. CI): set SCL_SECRETS_PASSWORD in the environment.
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import readline from "node:readline";

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1")), "..");
const ENV_FILE = path.join(ROOT, ".env.local");
const ENC_FILE = path.join(ROOT, "secrets", "env.enc");
const KDF = { N: 2 ** 15, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };

function askHidden(question) {
  if (process.env.SCL_SECRETS_PASSWORD) return Promise.resolve(process.env.SCL_SECRETS_PASSWORD);
  if (!process.stdin.isTTY) {
    console.error("No terminal for the password prompt. Run this in a normal terminal, or set SCL_SECRETS_PASSWORD.");
    process.exit(1);
  }
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
    let muted = false;
    rl._writeToOutput = (s) => { if (!muted) rl.output.write(s); else if (s.includes("\n")) rl.output.write("\n"); };
    rl.question(question, (answer) => { rl.close(); resolve(answer); });
    muted = true;
  });
}

/** Parses KEY=VALUE lines; ignores comments and blanks. */
export function parseEnv(text) {
  const out = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)\s*$/);
    if (m && m[2] !== "") out[m[1]] = m[2].replace(/^(['"])(.*)\1$/, "$2");
  }
  return out;
}

/** Updates/adds keys in an env file's text, keeping comments and other lines. */
export function mergeEnv(text, values) {
  let result = text;
  for (const [k, v] of Object.entries(values)) {
    const re = new RegExp(`^\\s*${k}\\s*=.*$`, "m");
    result = re.test(result) ? result.replace(re, `${k}=${v}`) : `${result.replace(/\s*$/, "")}${result.trim() ? "\n" : ""}${k}=${v}\n`;
  }
  return result.endsWith("\n") ? result : `${result}\n`;
}

export function encrypt(values, password) {
  const salt = randomBytes(16), iv = randomBytes(12);
  const key = scryptSync(password, salt, 32, KDF);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(values), "utf8"), cipher.final()]);
  return JSON.stringify({ v: 1, kdf: "scrypt", N: KDF.N, r: KDF.r, p: KDF.p, salt: salt.toString("base64"), iv: iv.toString("base64"), tag: cipher.getAuthTag().toString("base64"), data: data.toString("base64"), keys: Object.keys(values) }, null, 2) + "\n";
}

export function decrypt(fileText, password) {
  const f = JSON.parse(fileText);
  if (f.v !== 1 || f.kdf !== "scrypt") throw new Error("Unsupported secrets file format.");
  const key = scryptSync(password, Buffer.from(f.salt, "base64"), 32, { N: f.N, r: f.r, p: f.p, maxmem: KDF.maxmem });
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(f.iv, "base64"));
  decipher.setAuthTag(Buffer.from(f.tag, "base64"));
  try {
    return JSON.parse(Buffer.concat([decipher.update(Buffer.from(f.data, "base64")), decipher.final()]).toString("utf8"));
  } catch {
    throw new Error("Wrong password (or the file was modified). Nothing was written.");
  }
}

async function lock() {
  if (!existsSync(ENV_FILE)) { console.error("No .env.local found. Add your keys first (or use Settings in the app), then run this again."); process.exit(1); }
  const values = parseEnv(readFileSync(ENV_FILE, "utf8"));
  const names = Object.keys(values);
  if (!names.length) { console.error(".env.local has no values to encrypt."); process.exit(1); }
  console.log(`Encrypting ${names.length} value(s): ${names.join(", ")}`);
  const p1 = await askHidden("Choose a team password (min 12 characters): ");
  if (p1.length < 12) { console.error("Password too short — use at least 12 characters."); process.exit(1); }
  if (!process.env.SCL_SECRETS_PASSWORD) {
    const p2 = await askHidden("Repeat the password: ");
    if (p1 !== p2) { console.error("Passwords do not match. Nothing was written."); process.exit(1); }
  }
  mkdirSync(path.dirname(ENC_FILE), { recursive: true });
  writeFileSync(ENC_FILE, encrypt(values, p1));
  console.log(`Saved ${path.relative(ROOT, ENC_FILE)} — safe to commit. Share the password privately (never in the repo).`);
}

async function unlock() {
  if (!existsSync(ENC_FILE)) { console.error("secrets/env.enc not found. Ask the team to run `npm run secrets:lock` and commit it."); process.exit(1); }
  const password = await askHidden("Team password: ");
  const values = decrypt(readFileSync(ENC_FILE, "utf8"), password);
  const current = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8") : "# Local secrets — never commit or share this file.\n";
  writeFileSync(ENV_FILE, mergeEnv(current, values), { mode: 0o600 });
  console.log(`Wrote ${Object.keys(values).length} value(s) to .env.local: ${Object.keys(values).join(", ")}. Restart the server if it is running.`);
}

const command = process.argv[2];
// Run only when executed directly (tests import the functions).
if (process.argv[1]?.replace(/\\/g, "/").endsWith("scripts/secrets.mjs")) {
  const run = command === "lock" ? lock : command === "unlock" ? unlock : null;
  if (!run) { console.log("Usage: node scripts/secrets.mjs lock|unlock"); process.exit(1); }
  run().catch((e) => { console.error(e.message); process.exit(1); });
}
