# Prototype Instructions

Run the local server yourself and open the preview in the browser available to this environment. Do not give the user server-start instructions when you can run it.

Before making substantial visual changes, use the Product Design plugin's `get-context` skill when the visual source is unclear or no longer matches the current goal. When the user gives durable prototype-specific design feedback, preferences, or decisions, record them in `AGENTS.md`.

When implementing from a selected generated mock, treat that image as the source of truth for layout, component anatomy, density, spacing, color, typography, visible content, and hierarchy.

Build app UI in `src/`. Keep `.openai/hosting.json`, `worker/index.js`, `scripts/prepare-sites-build.mjs`, and `tests/sites-worker.test.mjs` intact so the same local prototype can be handed to Sites. Before a Sites handoff, run `npm run build` and `npm run test:sites`; the build must leave `dist/client/index.html`, `dist/server/index.js`, and `dist/.openai/hosting.json`.

## Durable product decisions

- Keep the primary natural-language search visible in the first mobile viewport, before the gateway tiles.
- Search results should feel compact and Google-like: direct answer first, inline numbered links to the cited originals, the broad relevance-ranked result list, then related questions.
- Never expose provider names, model names, vector stores, databases, fallback labels, connection states, or other infrastructure jargon in the public UI or public API response.
- Terrapoint belongs only in its dedicated full-app iframe section. Do not use Terrapoint branding, provider metadata, redirects, or results in the general Keskkonnaportaal search.
- An embedded application must never autofocus or move the host page on initial load. Verify a fresh desktop load remains at `scrollY === 0` and the iframe is not the active element.
- Autocomplete must stay above adjacent content, show at most five useful questions, remain viewport-bounded, and support Arrow Up/Down, Enter, Escape, mouse, and touch.
- A generic query such as `mets` must return a genuine source-grounded synthesis, not a list of copied search-result excerpts.
- AI answer evidence must come from the same current, filtered and relevance-ranked result set shown to the user; the legacy reviewed forestry corpus may support tests or definitions, but must not bypass live retrieval for a primary answer.
- Search ordering is relevance-first. Authority, completeness and freshness refine comparable results; a newer but off-topic page must not outrank a directly relevant source.
- A multi-term result must match the subject intent, not merely a place name or one incidental word. Current weather and air-quality intents lead to their official live services instead of historical articles.
- AI eligibility requires one actual title/summary/full-text passage to cover the question; manually assigned tags alone never authorize a factual answer. If the model fails, a cited current-source extract may be shown instead of an old prewritten answer.
- Search results expose stable source, content-type, year and sort filters. Changing a filter invalidates and rebuilds the answer from the filtered evidence.
- The answer typography stays restrained and visually coherent with the result list, and the answer supports bounded, cited inline follow-up questions that re-run retrieval for every turn.
- Inline answer citations open the cited HTTPS source directly in a new tab. Do not route citation clicks to a duplicate in-page source-card section.
- Do not render a separate "Vastuses viidatud allikad" section or the generic "Vastuses kasutatakse ainult kuvatud ametlikke allikaid" disclaimer under every answer; keep the broad ranked results and inline source links as the compact verification path.
- Broad conceptual questions may be synthesized in the model's own words, but a coincidental keyword match never authorizes evidence. Retrieve several intent-relevant official sources, give the model enough bounded full-text context, and require every material factual claim to remain grounded in those visible sources.
