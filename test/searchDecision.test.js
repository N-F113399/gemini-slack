import test from "node:test";
import assert from "node:assert/strict";
import { decideSearch } from "../src/services/search/searchDecision.js";

test("decideSearch enables explicit search with a query", () => {
  const result = decideSearch("search: PostgreSQL 18 latest features");
  assert.equal(result.shouldSearch, true);
  assert.equal(result.reason, "explicit");
  assert.equal(result.query, "PostgreSQL 18 latest features");
});

test("decideSearch enables search for explicit web lookup", () => {
  const result = decideSearch("look up the web for PostgreSQL 18");
  assert.equal(result.shouldSearch, true);
  assert.equal(result.reason, "explicit");
  assert.equal(result.query, "look up the web for PostgreSQL 18");
});

test("decideSearch enables search for freshness-sensitive Japanese requests", () => {
  const result = decideSearch("PostgreSQL 18の最新情報を調べて");
  assert.equal(result.shouldSearch, true);
  assert.equal(result.reason, "trigger");
});

test("decideSearch does not search ordinary requests", () => {
  const result = decideSearch("PostgreSQLについて教えて");
  assert.equal(result.shouldSearch, false);
  assert.equal(result.reason, "none");
  assert.equal(result.query, null);
});
