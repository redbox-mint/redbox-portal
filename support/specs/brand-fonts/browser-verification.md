# T13 Browser Verification Report — Custom Brand Typeface

- Environment: throwaway compose project `t13branding` from this worktree
  (`support/development/docker-compose.yml` + port override 1501/9877, isolated
  mongo/solr volumes), URL `http://localhost:1501`, brand `default`, portal `rdmp`
- Codebase: worktree HEAD `fece50fe0` plus uncommitted T02–T12/T09-follow-up changes
- Browser: headless Chrome 152 (agent-browser 0.36.0, `--no-sandbox`), viewports
  1280×800 and 375×812
- Auth: local admin (`admin`) via the login UI
- Screenshots: `/tmp/t13shots/` (7 PNGs: home, branding states, preview, conflict reload, narrow)
- HAR captures: `/tmp/t13-home-custom.har`, `/tmp/t13-home-default.har`,
  `/tmp/t13-home-degraded.har`, `/tmp/t13-login*.har`

## Pass/fail matrix

| Check | Result | Evidence |
|---|---|---|
| Admin login via UI | PASS | researcher/home with ADMIN link after local-auth submit |
| Typography section renders (Default state, 4 slot cards, Default/Revert actions) | PASS | branding page text + screenshot |
| Face upload with progress, duplicate-submit guard | PASS | Regular 122-byte WOFF2 stored; "regular face uploaded" |
| Draft preview with local sample text (unsaved) | PASS | Shadow-DOM preview loads base + preview CSS; 4 style demos; sample text bound locally |
| Publish custom typeface; history v1 Active with actor | PASS | "Branding published"; `v1 Active … Local Admin Custom (regular)` |
| Custom brand: no Google font requests, Regular preloaded once | PASS | homepage HAR: 0 googleapis/gstatic, 1 `as=font` preload |
| `@font-face` descriptors, fixed alias, swap, relative URL | PASS | theme.css: 400/normal + swap + `ReDBox Brand Typeface`; `:host,:root` variable |
| Public font GET/HEAD: MIME, ETag, immutable, nosniff, length | PASS | curl: `font/woff2`, hash ETag, `max-age=31536000, immutable`, HEAD 200 |
| Same-origin `font-src 'self'` CSP | PASS | response CSP header contains `font-src 'self'` |
| Missing/corrupt object: 404 without substitution, browser fallback, no Google re-enable | PASS | deleted stored object → GET 404; homepage renders via fallback stack, 0 Google requests |
| Admin health warning for missing active face | PASS after fix | banner "Active typeface health warnings / Stored font unavailable: regular (face-unavailable)" |
| Durable shared draft across 2 sessions | PASS | session B sees session A's unpublished draft |
| Stale-write conflict UX with reload, sample text preserved | PASS | "shared draft changed… Reload latest state"; `keep me` survives save-conflict and reload |
| Restore with confirmation creates new version | PASS | v1 → v2 Active, v1 retained, actor shown |
| Use Default Typography + publish restores Google fonts | PASS | homepage HAR after default publish: 7 Google requests, no preload |
| Narrow viewport 375px, no horizontal overflow | PASS | scrollWidth == innerWidth == 375 |
| Keyboard/focus basics, aria labels, alert roles | PASS (basic) | 20 focusable controls; labelled file inputs; `role=alert`/`status` |
| Icon fonts still served | PASS | icon woff2/ttf requests present in custom-brand HAR |
| Researcher home, dashboard, admin pages render custom | PASS | text/HAR spot checks |

## Limitations / notes

- Record search page could not render: fresh isolated Solr core has no indexed
  data (Solr 400). Unrelated to branding; record `layout.ejs` carries the
  character-identical conditional font block as the verified layouts and is
  EJS-compile- and assertion-covered in `BrandingFontDelivery.test.ts`.
- Cross-portal cache reuse and print output are covered by construction
  (portal-independent URL, print var wiring) and unit tests, not live here
  (single-portal env, no print emulation).
- Screen-reader verification is basics-only (roles/labels present).
- Historical version preview was exercised via Bruno (T12), not live UI.

## Remediation

- T13-1 (found live, fixed same session): active `healthWarnings` were exposed
  by the API but never rendered. Added a warnings banner (`branding-health-*`
  translation keys), unit test, rebuilt the branding app, and re-verified live
  including the translated strings (DB bundle updated for the throwaway env;
  fresh deployments seed from `language-defaults`). No open remediation items.

## Addendum — theme.css browser caching (reported separately, fixed)

- Symptom: published fonts/colours took up to ~5 minutes to apply. Cause:
  `theme.css` was served `public, max-age=300, must-revalidate`, so browsers
  kept stale CSS (which carries the `@font-face` rules) while the page HTML
  itself is `no-store` and already pointed at the new font.
- Fix: layouts now pin the publication hash (`styles/theme.css?v=<hash>`);
  `renderCss` answers hash-matching requests `public, max-age=31536000,
  immutable` and keeps 300s revalidation otherwise. A publish mints a new URL,
  so it applies on the very next page load.
- Verified live: publish v8 → homepage pins `?v=dad2c7f5…` → first fetch of
  that URL returns the new colour (#123456) and current `@font-face` with
  immutable headers; stale/wrong `v` keeps the old 300s behavior. Unit tests:
  `BrandingFontDelivery.test.ts` ("serves immutable theme CSS…", "versions
  theme stylesheet URLs…").

## Addendum — partial font application (reported separately, fixed)

- Symptom: after publish, the nav menu used the new font but sidebar,
  headings, and Admin content kept the old font; preview appeared unchanged.
- Cause: the branding Angular app's global `body { font-family: Arial, … }`
  loads after `theme.css` and permanently beat the generated brand variable
  (live proof: body computed to Arial while `:root` variable and menu rule
  were correct). Audit showed no other embedded app hardcodes a body font.
- Fix: `angular/projects/researchdatabox/branding/src/styles.scss` now uses
  `font-family: var(--rb-brand-font-family, Arial, Helvetica, sans-serif)`,
  plus a regression test (`keeps embedded Angular apps from pinning a
  hardcoded body font`) scanning every embedded app's global styles.
- Verified live: menu, sidebar, headings, and body all compute to the brand
  stack; preview Shadow DOM (h1/p/button/all four style samples) resolves to
  the brand stack.
- Note: Angular API calls use the absolute configured `APP_URL`, so the
  portal must be browsed via that same hostname (`http://100.104.227.109:1501`
  here); a different hostname (e.g. `localhost`) fails cross-origin with
  status 0. Pre-existing platform behavior, unchanged by this feature.

## Addendum — stale preview after draft mutations (reported separately, fixed)

- Symptom: preview did not reflect a newly uploaded font.
- Cause: `saveDraft`/`publish`/`restoreVersion` cleared the displayed preview,
  but `uploadFace`, `removeFace`, `useDefaultTypography`, and
  `revertTypefaceDraft` left the previous revision's CSS on screen. The stale
  preview is bound to an older draft revision, so it can never show the new
  font.
- Fix: all draft mutations now funnel through a `clearPreview()` helper, with
  a unit test (`clears a displayed preview on every draft mutation`) covering
  upload/remove/default/revert.
- Verified live: generate preview → upload a face → preview panel disappears
  ("regular face uploaded"); regenerate → Shadow DOM headings, body, buttons,
  and style samples all compute to the brand stack (screenshot).
