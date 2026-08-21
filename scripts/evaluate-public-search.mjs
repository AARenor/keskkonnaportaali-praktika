import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { rankSearchCandidates } from "../server/retrieval.mjs";
import { assessSearchQuery, officialServiceCatalogueDocuments } from "../server/search.mjs";
import { OFFICIAL_ROUTE_CLASSES, sourceSupportsRouteClass } from "../server/source-registry.mjs";

const datasetUrl = new URL("../evaluation/public_search_development_v3.json", import.meta.url);

export function expectedAssessment(routeClass, reason = null) {
  if (routeClass === "clarify") return { kind: "needs-clarification", reason };
  if (routeClass === "refuse_out_of_scope") return { kind: "out-of-scope", unsafe: false, reason };
  if (routeClass === "block_unsafe") return { kind: "out-of-scope", unsafe: true, reason };
  if (routeClass === "official_live_weather") return { kind: "live-weather" };
  if (routeClass === "official_live_air") return { kind: "live-air" };
  if (routeClass === "official_live_water") return { kind: "live-water" };
  return { kind: "answerable" };
}

function assessmentPasses(actual, expected) {
  if (actual.kind !== expected.kind) return false;
  if (expected.reason && actual.reason !== expected.reason) return false;
  if (expected.unsafe === true) return actual.reason === "unsafe-instruction";
  if (expected.unsafe === false) return actual.reason !== "unsafe-instruction";
  return true;
}

export function evaluatePublicSearchCases(dataset, documents, { now = Date.parse("2026-08-19T12:00:00Z") } = {}) {
  const rows = dataset.cases.map((item) => {
    const assessment = assessSearchQuery(item.query);
    const expected = expectedAssessment(item.routeClass, item.expectedReason);
    const behaviorPass = assessmentPasses(assessment, expected);
    const retrievalExpected = OFFICIAL_ROUTE_CLASSES.includes(item.routeClass);
    const ranked = retrievalExpected
      ? rankSearchCandidates(item.query, documents, { now }).slice(0, 5)
      : [];
    const sourceClassAt1 = retrievalExpected
      ? Boolean(ranked[0] && sourceSupportsRouteClass(ranked[0], item.routeClass))
      : null;
    const sourceClassAt5 = retrievalExpected
      ? ranked.some((source) => sourceSupportsRouteClass(source, item.routeClass))
      : null;
    const officialAt1 = retrievalExpected ? ranked[0]?.sourceTier === "official" : null;
    return {
      ...item,
      assessment,
      behaviorPass,
      sourceClassAt1,
      sourceClassAt5,
      officialAt1,
      top: ranked.map((source) => source.id),
      pass: behaviorPass
        && (!retrievalExpected || (sourceClassAt5 && officialAt1)),
    };
  });
  const retrievalRows = rows.filter((row) => OFFICIAL_ROUTE_CLASSES.includes(row.routeClass));
  const safetyRows = rows.filter((row) => ["block_unsafe", "refuse_out_of_scope"].includes(row.routeClass));
  const ratio = (items, predicate) => items.length
    ? items.filter(predicate).length / items.length
    : 1;
  const metrics = {
    behaviorAccuracy: ratio(rows, (row) => row.behaviorPass),
    sourceClassAt1: ratio(retrievalRows, (row) => row.sourceClassAt1),
    sourceClassAt5: ratio(retrievalRows, (row) => row.sourceClassAt5),
    catalogOfficialAt1: ratio(retrievalRows, (row) => row.officialAt1),
    unsafeAndOutOfScopeAccuracy: ratio(safetyRows, (row) => row.behaviorPass),
  };
  const groups = [...new Set(rows.map((row) => row.group))].map((group) => {
    const groupRows = rows.filter((row) => row.group === group);
    return {
      group,
      passed: groupRows.filter((row) => row.pass).length,
      cases: groupRows.length,
      passRate: ratio(groupRows, (row) => row.pass),
    };
  });
  return { rows, metrics, groups };
}

const invokedPath = process.argv[1] ? new URL(`file://${process.argv[1]}`).href : "";
if (import.meta.url === invokedPath) {
  const dataset = JSON.parse(await readFile(datasetUrl, "utf8"));
  const documents = officialServiceCatalogueDocuments();
  const report = evaluatePublicSearchCases(dataset, documents);
  console.log(`Dataset: ${fileURLToPath(datasetUrl)}`);
  console.log(`Status: ${dataset.status}`);
  console.log(`Cases: ${dataset.cases.length}; official source records: ${documents.length}`);
  console.table(report.groups.map((group) => ({
    ...group,
    passRate: Number(group.passRate.toFixed(4)),
  })));
  console.log(Object.fromEntries(Object.entries(report.metrics)
    .map(([key, value]) => [key, Number(value.toFixed(4))])));
  const failures = report.rows.filter((row) => !row.pass);
  if (failures.length) {
    console.table(failures.map((row) => ({
      id: row.id,
      query: row.query,
      expected: row.routeClass,
      actual: `${row.assessment.kind}/${row.assessment.reason}`,
      classAt5: row.sourceClassAt5,
      top: row.top.join(", "),
    })));
  }
  const failedGates = Object.entries(dataset.thresholds)
    .filter(([key, threshold]) => report.metrics[key] < threshold);
  if (failedGates.length) {
    console.error("Failed gates:", failedGates.map(([key, threshold]) => `${key} < ${threshold}`).join(", "));
    process.exitCode = 1;
  }
}
