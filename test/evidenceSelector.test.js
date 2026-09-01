import test from "node:test";
import assert from "node:assert/strict";
import { selectEvidence, buildSelectedEvidenceText } from "../src/services/search/evidenceSelector.js";

function result({ id, url, title, position, score = null, evidence }) {
  return {
    id,
    source: { type: "web", provider: "test", url, title, domain: new URL(url).hostname },
    ranking: { position, score },
    evidence,
  };
}

test("selectEvidence prefers highlights and preserves source metadata", () => {
  const response = {
    results: [
      result({
        id: "1",
        url: "https://example.com/one",
        title: "One",
        position: 1,
        evidence: {
          highlights: ["Important highlighted fact"],
          snippets: ["Supporting snippet"],
          text: "Long page content",
        },
      }),
    ],
  };

  const selection = selectEvidence(response, { maxResults: 1 });
  assert.equal(selection.resultCount, 1);
  assert.equal(selection.items[0].source.title, "One");
  assert.deepEqual(
    selection.items[0].evidence.map(item => item.type),
    ["highlight", "snippet", "text"],
  );
});

test("selectEvidence removes duplicate URLs", () => {
  const response = {
    results: [
      result({ id: "1", url: "https://example.com/a", title: "A", position: 1, evidence: { highlights: ["A"] } }),
      result({ id: "2", url: "https://example.com/a", title: "A duplicate", position: 2, evidence: { highlights: ["Duplicate"] } }),
      result({ id: "3", url: "https://example.com/b", title: "B", position: 3, evidence: { highlights: ["B"] } }),
    ],
  };

  const selection = selectEvidence(response, { maxResults: 5 });
  assert.equal(selection.resultCount, 2);
  assert.deepEqual(selection.items.map(item => item.source.url), [
    "https://example.com/a",
    "https://example.com/b",
  ]);
});

test("selectEvidence caps total evidence characters", () => {
  const response = {
    results: [
      result({
        id: "1",
        url: "https://example.com/a",
        title: "A",
        position: 1,
        evidence: { highlights: ["1234567890"] },
      }),
      result({
        id: "2",
        url: "https://example.com/b",
        title: "B",
        position: 2,
        evidence: { highlights: ["abcdefghij"] },
      }),
    ],
  };

  const selection = selectEvidence(response, { maxResults: 5, maxEvidenceChars: 12 });
  assert.equal(selection.totalChars, 12);
  assert.equal(selection.items.length, 2);
  assert.equal(selection.items[1].evidence[0].text, "ab");
});

test("buildSelectedEvidenceText formats selected sources", () => {
  const selection = selectEvidence({
    results: [result({
      id: "1",
      url: "https://example.com/a",
      title: "Example",
      position: 1,
      evidence: { highlights: ["Fact A"] },
    })],
  });

  assert.equal(
    buildSelectedEvidenceText(selection),
    "[Web Source 1]\nTitle: Example\nURL: https://example.com/a\nFact A",
  );
});