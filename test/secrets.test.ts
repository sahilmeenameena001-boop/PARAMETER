import { test } from "node:test";
import assert from "node:assert/strict";
import { decrypt, encrypt, mergeEnv, parseEnv } from "../scripts/secrets.mjs";

test("encrypt/decrypt round-trip with the right password; ciphertext does not contain the value", () => {
  const values = { FIRECRAWL_API_KEY: "fc-example0000000000000000", OTHER: "x=y" };
  const file = encrypt(values, "correct horse battery staple");
  assert.doesNotMatch(file, /fc-example/);
  assert.deepEqual(JSON.parse(file).keys, ["FIRECRAWL_API_KEY", "OTHER"]);
  assert.deepEqual(decrypt(file, "correct horse battery staple"), values);
});

test("wrong password or tampering fails", () => {
  const file = encrypt({ A: "1" }, "correct horse battery staple");
  assert.throws(() => decrypt(file, "wrong password here"), /Wrong password/);
  const f = JSON.parse(file);
  f.data = Buffer.from("tampered").toString("base64");
  assert.throws(() => decrypt(JSON.stringify(f), "correct horse battery staple"), /Wrong password/);
});

test("env parsing skips comments/blanks; merge keeps other lines", () => {
  assert.deepEqual(parseEnv("# c\nA=1\nB=\nC='q'\n\n"), { A: "1", C: "q" });
  assert.equal(mergeEnv("# keep\nA=old\nZ=2\n", { A: "new", B: "3" }), "# keep\nA=new\nZ=2\nB=3\n");
  assert.equal(mergeEnv("", { A: "1" }), "A=1\n");
});
