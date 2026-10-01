# Official source expansion round two

Date: 2026-10-01

## Outcome

Expand the search's reviewed official-source catalogue with authoritative Estonian environmental sources that fill demonstrated retrieval gaps, while preserving relevance-first ranking and the rule that visible evidence—not tags or general knowledge—authorizes an answer.

## Considered approaches

1. **Bulk-import sitemap pages.** Fastest count growth, but mostly duplicates the PostgreSQL discovery corpus and would weaken review, freshness, and grounding guarantees. Rejected.
2. **Build more dynamic API adapters.** Best for current numeric values, but each endpoint needs schema, unit, time, cardinality, and stale-response validation. Too costly before the research identifies a high-value numeric gap. Deferred.
3. **Add a small reviewed catalogue set through the existing source-profile path.** Recommended. Stable guidance/report pages can carry short versioned extracts; live registers and changing dashboards remain route-only. This increases useful coverage with no new subsystem.

## Design

Research first maps the current catalogue by ID, URL, route class, topic roots, and evidence eligibility. At least three discovery/fetch/gap rounds identify official candidates and reject duplicates, stale pages, inaccessible content, and sources that do not directly cover a realistic Estonian query.

Accepted records use the existing catalogue fields: stable `id`, title, organization, type, publication/update date, canonical HTTPS URL, tags, summary/content, locator where useful, route classes, evidence policy, delivery, review version/time, and bounded freshness. Stable directly quoted guidance or reports may be `versioned`; changing services are `route-only`; numeric/live claims require an existing typed adapter and are otherwise not answer evidence.

Tests lock each accepted source to an intended query and include unrelated, tag-only, stale, named-person/property, foreign-scope, and unsupported-detail controls. Documentation records publisher, access method, role, and limitations. The existing PostgreSQL corpus remains the broad discovery database; the reviewed catalogue remains the evidence gate.

## Verification

Targeted TDD precedes catalogue edits. Then run the full test suite, production build, Sites contract, holdout/blind/public/open evaluations, independent diff review, secret scan, commit/push, exact-SHA Coolify verification, repeated live probes, and desktop/mobile browser checks.
