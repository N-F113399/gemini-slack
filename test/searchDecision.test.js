import test from "node:test";
import assert from "node:assert/strict";
import { decideSearch } from "../src/services/search/searchDecision.js";

test("decideSearch enables explicit search with a query", () => {
  const result = decideSearch("search: PostgreSQL 18 latest features");
  assert.equal(result.shouldSearch, true);
  assert.equal(result.reason, "explicit");
  assert.equal(result.query, "PostgreSQL 18 latest features");
});

test("decideSearch supports explicit web search syntax", () => {
  const result = decideSearch("web search: PostgreSQL 18");
  assert.equal(result.shouldSearch, true);
  assert.equal(result.reason, "explicit");
  assert.equal(result.query, "PostgreSQL 18");
});

test("decideSearch enables search for freshness-sensitive Japanese requests", () => {
  const result = decideSearch("PostgreSQL 18の最新情報を調べて");
  assert.equal(result.shouldSearch, true);
  assert.equal(result.reason, "freshness");
});

test("decideSearch enables search for current information in English", () => {
  const result = decideSearch("What is the current PostgreSQL release?");
  assert.equal(result.shouldSearch, true);
  assert.equal(result.reason, "freshness");
});

test("decideSearch enables search for volatile information", () => {
  const result = decideSearch("What is the exchange rate between USD and JPY today?");
  assert.equal(result.shouldSearch, true);
  assert.equal(result.reason, "freshness");
});

test("decideSearch enables search for explicit research intent", () => {
  const result = decideSearch("research the PostgreSQL changes online");
  assert.equal(result.shouldSearch, true);
  assert.equal(result.reason, "research_intent");
});

test("decideSearch does not treat generic check as a search request", () => {
  const result = decideSearch("check this code for a null handling bug");
  assert.equal(result.shouldSearch, false);
  assert.equal(result.reason, "none");
});

test("decideSearch does not treat generic find as a web search request", () => {
  const result = decideSearch("find the bug in this function");
  assert.equal(result.shouldSearch, false);
  assert.equal(result.reason, "none");
});

test("decideSearch recognizes explicit online lookup intent", () => {
  const result = decideSearch("look up PostgreSQL 18 changes");
  assert.equal(result.shouldSearch, true);
  assert.equal(result.reason, "research_intent");
});

test("decideSearch does not search ordinary requests", () => {
  const result = decideSearch("PostgreSQLについて教えて");
  assert.equal(result.shouldSearch, false);
  assert.equal(result.reason, "none");
  assert.equal(result.query, null);
});

test("decideSearch handles an empty request", () => {
  const result = decideSearch("   ");
  assert.equal(result.shouldSearch, false);
  assert.equal(result.reason, "empty");
  assert.equal(result.query, null);
});
