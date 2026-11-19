const assert = require("node:assert/strict");
const test = require("node:test");
const decodeRegister = require("../services/register-value");

test("decodes unsigned 16-bit registers", () => {
  assert.equal(decodeRegister(65535, "UINT16"), 65535);
});

test("decodes signed 16-bit two's-complement values", () => {
  assert.equal(decodeRegister(32767, "INT16"), 32767);
  assert.equal(decodeRegister(65535, "INT16"), -1);
});

test("rejects unsupported types and invalid register values", () => {
  assert.throws(() => decodeRegister(1, "FLOAT32"), /non pris en charge/);
  assert.throws(() => decodeRegister(65536, "UINT16"), /invalide/);
});
