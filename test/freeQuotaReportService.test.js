import test from "node:test";
import assert from "node:assert/strict";
import { periodStart } from "../src/services/usage/freeQuotaReportService.js";

test("periodStart returns UTC day start", () => {
  const result = periodStart("day", new Date("2026-09-01T13:04:00Z"));
  assert.equal(result.toISOString(), "2026-09-01T00:00:00.000Z");
});

test("periodStart returns UTC month start", () => {
  const result = periodStart("month", new Date("2026-09-15T13:04:00Z"));
  assert.equal(result.toISOString(), "2026-09-01T00:00:00.000Z");
});
