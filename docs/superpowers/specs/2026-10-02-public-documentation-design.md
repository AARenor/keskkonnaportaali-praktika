# Public developer and user documentation

## Intent

Provide a shareable first documentation release at `/docs` for the developer
integrating this prototype into keskkonnaportaal.ee and for regular users.
Guides are in Estonian, matching the application and its intended audience.
Document current behaviour, not an already-completed portal integration.

## Approach

Use the existing Vite/React application and Express HTML fallback. A small,
separately loaded documentation page serves `/docs`, `/docs/kasutajale` and
`/docs/arendajale`. Native links navigate between pages and section anchors.
Guide sections are authored as React content with stable IDs and titles; those
same sections supply the table of contents. No Markdown parser, routing
dependency, documentation service or additional backend endpoint is needed.

Alternatives considered: a separate documentation platform adds a deployment
and dependency burden; a single long README does not provide the requested
public, audience-specific navigation. Repository maintenance guides remain
available as supplementary links, explicitly distinguished from the current
integration contract where older material has drifted.

## Content boundary

- User guide: first search, useful Estonian questions, suggestions, filters,
  citations, dates, charts, follow-ups, privacy, empty/error states and the
  separate Terrapoint section.
- Developer guide: integration boundary, endpoint request/response shapes,
  progressive delivery, cancellation, filters, failure handling, origin/proxy
  configuration, build identity, runtime requirements, privacy and a handover
  acceptance checklist. Source-code links make claims auditable.
- State that portal CMS, login/SSO, production origin, service ownership and
  rollout require agreement with the receiving team; none is implemented by
  publishing these guides.
- Never publish credentials, private operational values or personal queries.
  Provider-specific infrastructure belongs only in the technical guide, not
  regular-user instructions or public search responses.

## UI

Reuse local Roboto and portal colours: navy `#003b86`, blue `#0073b8`, ink
`#263f50`, muted `#5d6b74`, line `#c9d5dc`, white `#ffffff`.
Desktop: quiet top bar, audience navigation, left section index and a readable
article column. Mobile: the index becomes a native disclosure above the article;
code and tables scroll inside their own boxes. No decorative animation, imagery
or homepage redesign. Visible focus, skip link, semantic headings and print
styles are part of the initial release.

## Routing and errors

Only `/docs` and its descendants enter the documentation view. Accept trailing
slashes. Unknown documentation pages show a clear not-found view with recovery
links. The normal search application remains unchanged for other paths. This
does not add a new backend status-code contract for HTML routes.

## Verification and delivery

Write failing route/render/navigation tests before implementation. Render the
real components through the existing Vite SSR test pattern. Check section IDs,
internal links, audience navigation and unknown-page recovery. Verify both
guides and anchor navigation in a real browser at desktop and mobile widths,
including keyboard navigation, long-code overflow and a fresh homepage load.
Run `npm test`, `npm run build` and `npm run test:sites`. Independently review
the diff and verify examples against actual APIs. Commit only intended files,
push main, then require Coolify's finished record for that SHA plus live docs,
build identity, search fingerprints and the production eval battery.
