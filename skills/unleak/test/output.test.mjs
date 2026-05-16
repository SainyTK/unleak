import test from "node:test";
import assert from "node:assert/strict";
import { hmacValue, maskValue, toCsv } from "../scripts/lib/output.mjs";

test("HMAC output is stable and truncated", () => {
  const first = hmacValue("secret", "customer-1");
  const second = hmacValue("secret", "customer-1");
  assert.equal(first, second);
  assert.match(first, /^h_[0-9a-f]{16}$/);
  assert.notEqual(first, "customer-1");
});

test("mask modes protect email, phone, partial, and null values", () => {
  assert.equal(maskValue("alice@example.com", { mode: "email" }), "a***@example.com");
  assert.equal(maskValue("+66 81 111 2222", { mode: "phone" }), "*******2222");
  assert.equal(maskValue("abcdef", { mode: "partial", showLast: 2 }), "****ef");
  assert.equal(maskValue(null, { mode: "email" }), null);
});

test("CSV serialization quotes commas, quotes, CR, LF, and nulls", () => {
  const csv = toCsv([
    { a: "contains, comma", b: 'has "quote"', c: "line\nbreak", d: "carriage\rreturn", e: null }
  ], ["a", "b", "c", "d", "e"]);
  assert.equal(csv, 'a,b,c,d,e\n"contains, comma","has ""quote""","line\nbreak","carriage\rreturn",\n');
});
