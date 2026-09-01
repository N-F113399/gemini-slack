import test from "node:test";
import assert from "node:assert/strict";
import {
  buildEvidenceAttribution,
  buildAttributionInstruction,
} from "../src/services/search/evidenceAttribution.js";

test("buildEvidenceAttribution assigns stable source IDs", () => {
  const attribution = buildEvidenceAttribution({
    items: [
      {
        source: { title: "One", url: "https://one.example" },
        evidence: [{ type: "snippet", text: "one evidence" }],
      },
      {
        source: { title: "Two", url: "https://two.example" },
        evidence: [{ type: "highlight", text: "two evidence" }],
      },
    ],
  });

  assert.deepEqual(attribution.map(item => item.sourceId), ["S1", "S2"]);
  assert.deepEqual(attribution[0].evidence, ["one evidence"]);
});

test("buildAttributionInstruction requires citations from available sources only", () => {
  const instruction = buildAttributionInstruction();
  assert.match(instruction, /source IDs/i);
  assert.match(instruction, /Only cite source IDs/i);
  assert.match(instruction, /Do not fabricate/i);
});
