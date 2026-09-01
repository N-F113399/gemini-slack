import { decideSearch } from "./searchDecision.js";
import { selectEvidence, buildSelectedEvidenceText } from "./evidenceSelector.js";
import { buildEvidenceAttribution, buildAttributionInstruction } from "./evidenceAttribution.js";
import { evaluateCitationCoverage } from "./citationCoverage.js";
import { evaluateSearchSources, detectSourceConflicts } from "./searchSourceEvaluator.js";
import { scoreSearchAnswer } from "./searchQualityScorer.js";

export async function runSearchAnswerPipeline({
  userMessage,
  searchService,
  generateAnswer,
  maxResults = 5,
  maxEvidenceChars = 4000,
  searchOptions = {},
} = {}) {
  if (typeof userMessage !== "string") throw new TypeError("userMessage must be a string");
  if (!searchService || typeof searchService.search !== "function") {
    throw new TypeError("searchService.search must be a function");
  }
  if (typeof generateAnswer !== "function") throw new TypeError("generateAnswer must be a function");

  const decision = decideSearch(userMessage);
  if (!decision.shouldSearch) {
    const answer = await generateAnswer({ decision, evidence: null, attributionInstruction: null });
    return {
      decision,
      answer,
      sources: [],
      citationCoverage: null,
      qualityScore: null,
      attribution: null,
      searchContext: null,
    };
  }

  const searchResponse = await searchService.search({
    text: decision.query,
    ...searchOptions,
    maxResults,
  });

  const selection = selectEvidence(searchResponse, { maxResults, maxEvidenceChars });
  const attribution = buildEvidenceAttribution(selection);
  const searchContext = buildSelectedEvidenceText(selection);
  const evaluatedSources = evaluateSearchSources(selection.items.map(item => item.result));
  const conflicts = detectSourceConflicts(evaluatedSources);

  const answer = await generateAnswer({
    decision,
    evidence: selection,
    attributionInstruction: buildAttributionInstruction(attribution),
    searchContext,
    attribution,
  });

  const citationCoverage = evaluateCitationCoverage(
    typeof answer === "string" ? answer : answer?.text || "",
    selection.items.length,
  );
  const qualityScore = scoreSearchAnswer({
    citationCoverage: { ...citationCoverage, sourceCount: selection.items.length },
    evaluatedSources,
    conflicts,
  });

  return {
    decision,
    answer,
    sources: attribution,
    citationCoverage,
    qualityScore,
    conflicts,
    searchContext,
  };
}
