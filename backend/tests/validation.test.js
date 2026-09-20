import assert from "node:assert/strict";
import test from "node:test";

import { filterValidAllergies, isValidAllergyId } from "../src/config/allergies.js";
import { normalizeEmail, normalizeNameKey } from "../src/utils/normalize.js";
import { validateAllergiesUpdate, validateLogin, validateRegister } from "../src/utils/validation.js";

test("normaliza e-mail e nome de usuário", () => {
  assert.equal(normalizeEmail("  DIEGO@EXEMPLO.COM "), "diego@exemplo.com");
  assert.equal(normalizeNameKey("  Diégo   Silva "), "diego silva");
});

test("valida alergias conhecidas e remove duplicadas", () => {
  // "banana" entrou no catalogo em 11/09/2026 e virou id valido; o exemplo de
  // id invalido precisa ser um que nunca vai existir.
  assert.equal(isValidAllergyId("milk"), true);
  assert.equal(isValidAllergyId("banana"), true);
  assert.equal(isValidAllergyId("alergia-inexistente"), false);
  assert.deepEqual(filterValidAllergies(["milk", "milk", "gluten", "alergia-inexistente"]), [
    "milk",
    "gluten",
  ]);
  assert.deepEqual(validateAllergiesUpdate({ allergies: ["milk", "milk"] }).allergies, ["milk"]);
  assert.throws(() => validateAllergiesUpdate({ allergies: ["alergia-inexistente"] }));
});

test("valida register e login", () => {
  const register = validateRegister({
    name: "Diego",
    email: "DIEGO@EXEMPLO.COM",
    password: "123456",
    allergies: ["milk"],
  });

  assert.equal(register.email, "diego@exemplo.com");
  assert.equal(register.nameKey, "diego");
  assert.deepEqual(register.allergies, ["milk"]);

  const login = validateLogin({ identifier: " Diego ", password: "123456" });
  assert.equal(login.identifierKey, "diego");
  assert.throws(() => validateRegister({ name: "D", email: "x", password: "1", allergies: [] }));
});
