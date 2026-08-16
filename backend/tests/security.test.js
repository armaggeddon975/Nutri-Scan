import assert from "node:assert/strict";
import test from "node:test";

import { hashPassword, verifyPassword } from "../src/utils/password.js";
import { generateSessionToken, hashSessionToken } from "../src/utils/sessionToken.js";

test("hashPassword gera salt/hash e verifyPassword valida corretamente", async () => {
  const password = "senha-segura-123";
  const result = await hashPassword(password);

  assert.equal(typeof result.salt, "string");
  assert.equal(typeof result.hash, "string");
  assert.notEqual(result.hash, password);
  assert.equal(await verifyPassword(password, result.salt, result.hash), true);
  assert.equal(await verifyPassword("senha-errada", result.salt, result.hash), false);
});

test("session token tem entropia adequada e banco recebe apenas hash", () => {
  const token = generateSessionToken();
  const tokenHash = hashSessionToken(token);

  assert.equal(typeof token, "string");
  assert.ok(token.length >= 40);
  assert.equal(tokenHash.length, 64);
  assert.notEqual(tokenHash, token);
  assert.equal(hashSessionToken(token), tokenHash);
});
