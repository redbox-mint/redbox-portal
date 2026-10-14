import fs from 'node:fs';
import path from 'node:path';
import { Catalogue, DocumentationHealth, SurfaceContract } from './catalogue';
import { repositoryRoot } from './source';

const WIKI_URL = 'https://github.com/redbox-mint/redbox-portal/wiki';
const REPOSITORY_URL = 'https://github.com/redbox-mint/redbox-portal';
const BRAND_LOGO = path.join(repositoryRoot, 'assets/images/logo.png');

type Section = 'home' | 'extensions' | 'forms' | 'api' | 'none';

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;').replaceAll('"', '&quot;');
}

// TSDoc summaries use markdown backticks for symbol names; render them as code.
function prose(value: string): string {
  return escapeHtml(value).replaceAll(/`([^`]+)`/g, '<code>$1</code>');
}

function slug(value: string): string {
  return value.replaceAll(/[^a-zA-Z0-9_-]+/g, '-').toLowerCase();
}

function surfaceDirectory(surface: SurfaceContract): string {
  if (surface.kind === 'form-config' || surface.kind === 'form-component') return 'forms';
  return 'extensions';
}

function kindLabel(surface: SurfaceContract): string {
  return surface.kind.replaceAll('-', ' ');
}

function lifecycleBadge(surface: SurfaceContract): string {
  return `<span class="badge badge-${surface.lifecycle}">${escapeHtml(surface.lifecycle)}</span>`;
}

function navigation(relativeRoot: string, section: Section): string {
  const items: Array<[Section, string, string]> = [
    ['home', `${relativeRoot}/index.html`, 'Start'],
    ['extensions', `${relativeRoot}/extensions/index.html`, 'Extensions'],
    ['forms', `${relativeRoot}/forms/index.html`, 'Form configuration'],
    ['api', `${relativeRoot}/api/index.html`, 'REST API'],
  ];
  return items
    .map(
      ([key, href, label]) =>
        `<a href="${href}"${key === section ? ' class="is-current" aria-current="page"' : ''}>${label}</a>`
    )
    .join('');
}

function layout(title: string, body: string, relativeRoot = '..', section: Section = 'home', noindex = false): string {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
${noindex ? '<meta name="robots" content="noindex, nofollow">\n' : ''}<title>${escapeHtml(title)} · ReDBox developer reference</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css?family=Titillium+Web:200,300,400,600,700&display=swap" rel="stylesheet">
<link href="https://fonts.googleapis.com/css?family=Roboto+Condensed:300,400,700&display=swap" rel="stylesheet">
<link href="https://fonts.googleapis.com/css?family=Raleway:100,200,400&display=swap" rel="stylesheet">
<link rel="icon" href="${relativeRoot}/assets/redbox-logo.png">
<link rel="stylesheet" href="${relativeRoot}/assets/reference.css">
</head>
<body>
<a class="skip-link" href="#content">Go to the content</a>
<header class="masthead">
  <div class="masthead-utility"><div class="shell">
    <a class="masthead-brand" href="${relativeRoot}/index.html"><img src="${relativeRoot}/assets/redbox-logo.png" alt="ReDBox" width="171" height="100"><span>Research Data Box</span></a>
    <ul class="masthead-utility-links">
      <li><a href="${WIKI_URL}">ReDBox Wiki</a></li>
      <li><a href="${REPOSITORY_URL}">Source code</a></li>
    </ul>
  </div></div>
  <div class="masthead-band"><div class="shell">
    <p class="masthead-title">Developer reference</p>
  </div></div>
  <nav class="masthead-nav" aria-label="Sections"><div class="shell">${navigation(relativeRoot, section)}</div></nav>
</header>
<main id="content"><div class="shell">${body}</div></main>
<footer class="site-footer"><div class="shell">
  <p>The build tools make this reference from the ReDBox source code.</p>
  <p>For the architecture, the workflows and the longer examples, read the <a href="${WIKI_URL}">ReDBox Wiki</a>.</p>
</div></footer>
</body>
</html>`;
}

function memberTable(surface: SurfaceContract): string {
  if (!surface.members.length) return '<p class="empty-state">This contract has no published members.</p>';
  return `<div class="table-wrap"><table class="data-table"><thead><tr><th scope="col">Member</th><th scope="col">Contract</th><th scope="col">Default</th><th scope="col">Purpose</th></tr></thead><tbody>${surface.members
    .map(
      member =>
        `<tr><td data-label="Member"><code>${escapeHtml(member.name)}</code></td><td data-label="Contract"><code>${escapeHtml(member.signature ?? member.type ?? '')}</code></td><td data-label="Default"><code>${escapeHtml(member.defaultValue ?? '')}</code></td><td data-label="Purpose">${prose(member.description ?? '')}<p class="cell-link"><a href="${member.source.url}">Open the source</a></p></td></tr>`
    )
    .join('')}</tbody></table></div>`;
}

function routeTable(surface: SurfaceContract): string {
  if (!surface.routes?.length) return '';
  return `<section><h2>Routes and permissions</h2><p class="section-note">Each route below connects a request to an action. The permissions column shows the roles that can use the route.</p><div class="table-wrap"><table class="data-table"><thead><tr><th scope="col">Method</th><th scope="col">Path</th><th scope="col">Action</th><th scope="col">Permissions</th></tr></thead><tbody>${surface.routes
    .map(
      route =>
        `<tr><td data-label="Method"><code class="method">${route.method}</code></td><td data-label="Path"><code>${escapeHtml(route.path)}</code></td><td data-label="Action"><code>${escapeHtml(route.action)}</code></td><td data-label="Permissions">${escapeHtml(route.authorization.join('; '))}</td></tr>`
    )
    .join('')}</tbody></table></div></section>`;
}

function relationshipList(surface: SurfaceContract): string {
  if (!surface.relationships) return '';
  const relationship = surface.relationships;
  const visitors = relationship.visitorMethods.map(item => `<code>${escapeHtml(item)}</code>`).join(' ');
  return `<section><h2>Related code</h2><p class="section-note">The items below show where ReDBox reads the defaults and where it makes the component.</p><dl class="fact-list">
<div><dt>Definition defaults</dt><dd><code>${escapeHtml(relationship.definitionMapping ?? 'None')}</code></dd></div>
<div><dt>Visitor methods</dt><dd>${visitors || 'None'}</dd></div>
<div><dt>Angular component</dt><dd><code>${escapeHtml(relationship.angularComponent ?? 'None')}</code></dd></div>
<div><dt>Angular model</dt><dd><code>${escapeHtml(relationship.angularModel ?? 'None')}</code></dd></div>
</dl></section>`;
}

function surfacePage(surface: SurfaceContract): string {
  const directory = surfaceDirectory(surface);
  const section: Section = directory === 'forms' ? 'forms' : 'extensions';
  const parent = directory === 'forms' ? 'Form configuration' : 'Extensions';
  const example = surface.example
    ? `<section><h2>Example</h2><p class="section-note">The build tools test this example each time they make this page.</p><pre><code>${escapeHtml(surface.example)}</code></pre></section>`
    : '';
  return layout(
    surface.name,
    `<nav class="breadcrumb" aria-label="Breadcrumb"><a href="../index.html">Start</a><span aria-hidden="true">/</span><a href="index.html">${parent}</a><span aria-hidden="true">/</span><span>${escapeHtml(surface.name)}</span></nav>
<div class="page-head">
  <p class="eyebrow">${escapeHtml(kindLabel(surface))}</p>
  <h1>${escapeHtml(surface.name)}</h1>
  <p class="badge-row">${lifecycleBadge(surface)}</p>
  <p class="lede">${prose(surface.documentation.summary)}</p>
  <p class="action-row"><a class="button" href="${surface.source.url}">Open the source file</a><span class="source-path"><code>${escapeHtml(surface.source.file)}:${surface.source.line}</code></span></p>
</div>
${surface.documentation.extensionSemantics ? `<aside class="callout"><p class="callout-title">How to change this contract</p><p>${prose(surface.documentation.extensionSemantics)}</p></aside>` : ''}
<section><h2>Members</h2>${memberTable(surface)}</section>${routeTable(surface)}${relationshipList(surface)}${example}`,
    '..',
    section
  );
}

function indexPage(
  title: string,
  lede: string,
  section: Section,
  surfaces: SurfaceContract[],
  resource = ''
): string {
  return layout(
    title,
    `<div class="page-head">
  <p class="eyebrow">Contract list</p>
  <h1>${escapeHtml(title)}</h1>
  <p class="lede">${lede}</p>
</div>${resource}
<div class="catalogue-tools"><label class="visually-hidden" for="search">Filter the contracts</label><input id="search" type="search" placeholder="Type a name, a kind or a purpose"><p id="search-status" class="catalogue-count" aria-live="polite">${surfaces.length} contracts</p></div>
<div class="table-wrap catalogue-table-wrap"><table class="data-table catalogue-table"><colgroup><col class="name-column"><col class="kind-column"><col class="summary-column"></colgroup><thead><tr><th scope="col">Contract</th><th scope="col">Kind</th><th scope="col">Purpose</th></tr></thead><tbody id="results">${surfaces
      .map(
        surface =>
          `<tr data-search="${escapeHtml(`${surface.name} ${surface.kind} ${surface.documentation.summary}`.toLowerCase())}"><td class="contract-name" data-label="Contract"><a href="${slug(surface.id)}.html">${escapeHtml(surface.name)}</a></td><td class="contract-kind" data-label="Kind">${escapeHtml(kindLabel(surface))}</td><td class="contract-summary" data-label="Purpose">${prose(surface.documentation.summary)}</td></tr>`
      )
      .join('')}</tbody></table></div>
<p class="empty-state" id="no-results" hidden>No contract agrees with the filter. Change the text, or clear the field.</p>
<script src="../assets/search.js"></script>`,
    '..',
    section
  );
}

function markdownSurface(surface: SurfaceContract): string {
  const members = surface.members.length
    ? `\n| Member | Contract | Default | Purpose |\n|---|---|---|---|\n${surface.members.map(member => `| \`${member.name}\` | \`${(member.signature ?? member.type ?? '').replaceAll('|', '\\|')}\` | \`${member.defaultValue ?? ''}\` | ${member.description ?? ''} |`).join('\n')}\n`
    : '\n_This contract has no published members._\n';
  return `## ${surface.name}\n\n- Kind: ${surface.kind}\n- Lifecycle: ${surface.lifecycle}\n- Source: [${surface.source.file}:${surface.source.line}](${surface.source.url})\n\n${surface.documentation.summary}\n\n${surface.documentation.extensionSemantics ? `How to change this contract: ${surface.documentation.extensionSemantics}\n` : ''}${members}`;
}

export function catalogueMarkdown(catalogue: Catalogue): string {
  return `# ReDBox extension contracts and form contracts\n\nSchema version: ${catalogue.schemaVersion}  \nSource commit: ${catalogue.sourceCommit}  \nBuild time: ${catalogue.generatedAt}\n\n${catalogue.surfaces.map(markdownSurface).join('\n')}`;
}

export function healthMarkdown(health: DocumentationHealth): string {
  const rows = health.findings.length
    ? health.findings
        .map(finding => `| ${finding.code} | ${finding.surfaceId ?? ''} | ${finding.message.replaceAll('|', '\\|')} |`)
        .join('\n')
    : '| — | — | The build found no problems. |';
  return `# Documentation health\n\nThis report is advisory. It does not stop the build.\n\n- Schema version: ${health.schemaVersion}\n- Source commit: ${health.sourceCommit}\n- Build time: ${health.generatedAt}\n- Findings: ${health.findingCount}\n\n| Code | Contract | Finding |\n|---|---|---|\n${rows}\n`;
}

const STYLESHEET = `/* ReDBox developer reference.
   The palette and the fonts follow assets/styles/default-variables.scss. */
:root {
  color-scheme: light;
  --rb-red: #b1101a;
  --rb-maroon: #500005;
  --rb-maroon-strong: #700007;
  --rb-bar: #f4f4f4;
  --rb-ink: #333;
  --rb-heading: #000;
  --rb-muted: #777;
  --rb-line: #ddd;
  --rb-rule: #eee;
  --rb-link: #337ab7;
  --rb-link-hover: #23527c;
  --rb-code: #c7254e;
  --rb-code-bg: #f9f2f4;
  --rb-pre-bg: #f5f5f5;
  --rb-pre-line: #ccc;
  --rb-stripe: #f9f9f9;
  --rb-hover: #f5f5f5;
  --rb-body: 'Titillium Web', 'Helvetica Neue', Arial, sans-serif;
  --rb-condensed: 'Roboto Condensed', 'Helvetica Neue', Arial, sans-serif;
  --rb-display: 'Raleway', 'Helvetica Neue', Arial, sans-serif;
}

* { box-sizing: border-box; }

body {
  margin: 0;
  background: #fff;
  color: var(--rb-ink);
  font: 400 16px/1.6 var(--rb-body);
}

.shell { max-width: 1180px; margin: 0 auto; padding: 0 20px; }

a { color: var(--rb-link); text-decoration: none; }
a:hover, a:focus { color: var(--rb-link-hover); text-decoration: underline; }

:focus-visible { outline: 3px solid var(--rb-red); outline-offset: 2px; }

.skip-link {
  position: absolute;
  left: -9999px;
  background: var(--rb-maroon);
  color: #fff;
  padding: 12px 20px;
  z-index: 10;
}
.skip-link:focus { left: 0; top: 0; color: #fff; }

.visually-hidden {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip: rect(0 0 0 0);
  white-space: nowrap;
}

/* Masthead: a light bar with the logo, a red band, then the dark red menu.
   This repeats the order used by the ReDBox portal layout. */
.masthead-utility { background: var(--rb-bar); border-bottom: 1px solid var(--rb-line); }
.masthead-utility .shell {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  min-height: 74px;
}
.masthead-brand { display: inline-flex; align-items: center; gap: 14px; color: #222; }
.masthead-brand:hover, .masthead-brand:focus { color: #222; text-decoration: none; }
.masthead-brand img { display: block; width: auto; height: 46px; }
.masthead-brand span {
  padding-left: 14px;
  border-left: 1px solid var(--rb-line);
  font-family: var(--rb-condensed);
  font-size: 15px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: var(--rb-muted);
}
.masthead-utility-links {
  display: flex;
  gap: 24px;
  margin: 0;
  padding: 0;
  list-style: none;
  font-family: var(--rb-condensed);
  font-size: 15px;
}
.masthead-utility-links a { color: #222; }
.masthead-utility-links a:hover, .masthead-utility-links a:focus { color: var(--rb-red); }

.masthead-band { background: var(--rb-red); padding: 11px 0; }
.masthead-title {
  margin: 0;
  font-family: var(--rb-condensed);
  font-size: 17px;
  font-weight: 400;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: #fff;
}

.masthead-nav { background: var(--rb-maroon); }
.masthead-nav .shell { display: flex; flex-wrap: wrap; padding: 0 20px; }
.masthead-nav a {
  padding: 14px 18px;
  color: #fff;
  font-family: var(--rb-condensed);
  font-size: 16px;
  letter-spacing: 0.02em;
  border-bottom: 4px solid transparent;
}
.masthead-nav a:hover, .masthead-nav a:focus {
  background: var(--rb-maroon-strong);
  color: #fff;
  text-decoration: none;
}
.masthead-nav a:first-child { padding-left: 0; }
.masthead-nav a.is-current { border-bottom-color: var(--rb-red); background: var(--rb-maroon-strong); }
.masthead-nav a.is-current:first-child { padding-left: 18px; }

main { padding: 36px 0 72px; }

.breadcrumb {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-bottom: 20px;
  font-family: var(--rb-condensed);
  font-size: 14px;
  color: var(--rb-muted);
}
.breadcrumb span[aria-hidden] { color: var(--rb-line); }

.page-head { border-bottom: 3px solid var(--rb-red); padding-bottom: 20px; margin-bottom: 28px; }
.eyebrow {
  margin: 0 0 6px;
  font-family: var(--rb-condensed);
  font-size: 13px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: var(--rb-red);
}
h1 {
  margin: 0;
  font-family: var(--rb-display);
  font-size: clamp(32px, 5vw, 50px);
  font-weight: 200;
  line-height: 1.1;
  color: var(--rb-heading);
  overflow-wrap: anywhere;
}
h2 {
  margin: 40px 0 12px;
  font-family: var(--rb-body);
  font-size: 24px;
  font-weight: 600;
  color: var(--rb-heading);
}
.lede { max-width: 70ch; margin: 14px 0 0; font-size: 19px; font-weight: 300; }
.section-note { max-width: 70ch; margin: 0 0 14px; color: var(--rb-muted); }
.badge-row { margin: 14px 0 0; }
.action-row { display: flex; flex-wrap: wrap; align-items: center; gap: 14px; margin: 20px 0 0; }
.source-path { color: var(--rb-muted); font-size: 14px; overflow-wrap: anywhere; }
.source-path code { background: var(--rb-bar); color: var(--rb-muted); }

.button {
  display: inline-block;
  padding: 8px 18px;
  background: var(--rb-red);
  color: #fff;
  font-family: var(--rb-condensed);
  border: 1px solid var(--rb-red);
}
.button:hover, .button:focus { background: var(--rb-maroon); border-color: var(--rb-maroon); color: #fff; text-decoration: none; }

.badge {
  display: inline-block;
  padding: 3px 10px;
  border: 1px solid transparent;
  border-radius: 2px;
  font-family: var(--rb-condensed);
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  white-space: nowrap;
}
.badge-supported { background: #dff0d8; border-color: #c6e0bd; color: #2d6a2d; }
.badge-experimental { background: #fcf8e3; border-color: #faebcc; color: #8a6d3b; }
.badge-deprecated { background: #f2dede; border-color: #ebccd1; color: #a94442; }
.badge-internal, .badge-unclassified { background: var(--rb-bar); border-color: var(--rb-line); color: var(--rb-muted); }

.cards { display: grid; grid-template-columns: repeat(auto-fit, minmax(250px, 1fr)); gap: 20px; margin: 28px 0 0; }
.card { display: flex; flex-direction: column; border: 1px solid var(--rb-line); border-top: 4px solid var(--rb-red); background: #fff; padding: 22px; }
.card h2 { margin: 0 0 10px; font-size: 21px; }
.card h2 a { color: var(--rb-heading); }
.card h2 a:hover, .card h2 a:focus { color: var(--rb-red); }
.card-links { margin: 0; padding: 0; list-style: none; }
.card-links li + li { margin-top: 8px; }
.card-links a { font-weight: 600; }
.card p { margin: 0; color: var(--rb-ink); }
.card:hover { border-color: var(--rb-red); background: var(--rb-stripe); }

.callout { border: 1px solid var(--rb-line); border-left: 4px solid var(--rb-red); background: var(--rb-stripe); padding: 18px 20px; margin: 28px 0; }
.callout p { margin: 0; max-width: 70ch; }
.callout-title { font-family: var(--rb-condensed); font-size: 13px; letter-spacing: 0.12em; text-transform: uppercase; color: var(--rb-red); margin-bottom: 6px !important; }

.page-resource { display: flex; flex-wrap: wrap; align-items: baseline; gap: 10px; margin: 0 0 24px; color: var(--rb-muted); }
.page-resource a { font-weight: 600; }

.fact-list { margin: 0; }
.fact-list > div { display: grid; grid-template-columns: 220px minmax(0, 1fr); gap: 16px; padding: 10px 0; border-bottom: 1px solid var(--rb-rule); }
.fact-list dt { font-family: var(--rb-condensed); font-weight: 400; color: var(--rb-muted); }
.fact-list dd { margin: 0; overflow-wrap: anywhere; }

.catalogue-tools { display: flex; flex-wrap: wrap; align-items: center; justify-content: space-between; gap: 16px; margin: 0 0 14px; }
input[type="search"] {
  flex: 1 1 320px;
  max-width: 420px;
  padding: 9px 12px;
  border: 1px solid var(--rb-pre-line);
  border-radius: 0;
  font: inherit;
  color: #555;
}
.catalogue-count { margin: 0; font-family: var(--rb-condensed); color: var(--rb-muted); }

.table-wrap { overflow-x: auto; border: 1px solid var(--rb-line); }
.data-table { width: 100%; border-collapse: collapse; background: #fff; }
.data-table th {
  padding: 11px 14px;
  background: var(--rb-bar);
  border-bottom: 2px solid var(--rb-line);
  text-align: left;
  font-family: var(--rb-condensed);
  font-size: 13px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: #444;
}
.data-table td { padding: 12px 14px; border-bottom: 1px solid var(--rb-rule); text-align: left; vertical-align: top; }
.data-table tbody tr:nth-child(even) { background: var(--rb-stripe); }
.data-table tbody tr:hover { background: var(--rb-hover); }
.data-table tbody tr:last-child td { border-bottom: 0; }
.cell-link { margin: 6px 0 0; font-size: 14px; }

.catalogue-table { table-layout: fixed; }
.catalogue-table .name-column { width: 28%; }
.catalogue-table .kind-column { width: 18%; }
.catalogue-table .summary-column { width: 54%; }
.contract-name a { font-weight: 600; overflow-wrap: anywhere; }
.contract-kind { font-family: var(--rb-condensed); color: var(--rb-muted); text-transform: capitalize; }

.empty-state { color: var(--rb-muted); }
#no-results { margin-top: 16px; }

code { padding: 2px 5px; background: var(--rb-code-bg); color: var(--rb-code); font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 88%; overflow-wrap: anywhere; }
code.method { background: var(--rb-maroon); color: #fff; text-transform: uppercase; }
pre { margin: 0; padding: 16px; overflow-x: auto; background: var(--rb-pre-bg); border: 1px solid var(--rb-pre-line); color: #333; }
pre code { padding: 0; background: none; color: inherit; font-size: 14px; }

.site-footer { background: #000; color: #fff; padding: 32px 0 40px; margin-top: 60px; }
.site-footer p { margin: 0 0 8px; max-width: 78ch; color: #ddd; }
.site-footer a { color: #fff; text-decoration: underline; }
.site-footer a:hover, .site-footer a:focus { color: #fff; }

@media (max-width: 760px) {
  .masthead-utility .shell { min-height: 0; padding-top: 12px; padding-bottom: 12px; }
  .masthead-brand span { display: none; }
  .masthead-nav .shell { flex-direction: column; padding: 0; }
  .masthead-nav a, .masthead-nav a:first-child { padding: 12px 20px; border-bottom: 1px solid rgba(255, 255, 255, 0.15); border-left: 4px solid transparent; }
  .masthead-nav a.is-current { border-bottom-color: rgba(255, 255, 255, 0.15); border-left-color: var(--rb-red); }
  .fact-list > div { grid-template-columns: 1fr; gap: 2px; }
  .table-wrap { border: 0; }
  .data-table, .data-table tbody, .data-table tr, .data-table td { display: block; width: 100%; }
  .data-table colgroup, .data-table thead { display: none; }
  .data-table tbody tr { padding: 14px 0; border-top: 1px solid var(--rb-line); background: #fff !important; }
  .data-table td { padding: 3px 0; border: 0; }
  .data-table td::before {
    display: block;
    content: attr(data-label);
    font-family: var(--rb-condensed);
    font-size: 12px;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--rb-muted);
  }
  .contract-name a { font-size: 18px; }
}
`;

const SEARCH_SCRIPT = `const input = document.querySelector('#search');
const status = document.querySelector('#search-status');
const empty = document.querySelector('#no-results');
const rows = [...document.querySelectorAll('[data-search]')];

function update() {
  const query = (input?.value ?? '').toLowerCase().trim();
  let visible = 0;
  for (const row of rows) {
    row.hidden = Boolean(query) && !row.dataset.search.includes(query);
    if (!row.hidden) visible += 1;
  }
  if (status) status.textContent = query ? visible + ' of ' + rows.length + ' contracts' : rows.length + ' contracts';
  if (empty) empty.hidden = visible > 0;
}

input?.addEventListener('input', update);
update();
`;

export function renderSite(outputDirectory: string, catalogue: Catalogue): void {
  for (const directory of ['assets', 'extensions', 'forms', 'schemas', 'artifacts', 'api']) {
    fs.mkdirSync(path.join(outputDirectory, directory), { recursive: true });
  }
  fs.writeFileSync(path.join(outputDirectory, 'assets/reference.css'), STYLESHEET);
  fs.writeFileSync(path.join(outputDirectory, 'assets/search.js'), SEARCH_SCRIPT);
  if (fs.existsSync(BRAND_LOGO)) {
    fs.copyFileSync(BRAND_LOGO, path.join(outputDirectory, 'assets/redbox-logo.png'));
  }

  const extensions = catalogue.surfaces.filter(surface => surfaceDirectory(surface) === 'extensions');
  const forms = catalogue.surfaces.filter(surface => surfaceDirectory(surface) === 'forms');
  fs.writeFileSync(
    path.join(outputDirectory, 'extensions/index.html'),
    indexPage(
      'Extensions',
      'A hook uses these contracts to add functions to ReDBox, or to replace them. The list shows the hook protocol, the base contracts, the services, the controllers and their routes.',
      'extensions',
      extensions
    )
  );
  fs.writeFileSync(
    path.join(outputDirectory, 'forms/index.html'),
    indexPage(
      'Form configuration',
      'These contracts control the record forms. Each page shows the configuration properties, the default values and an example.',
      'forms',
      forms,
      '<p class="page-resource"><a href="../schemas/form-config.schema.json" download>Download the FormConfig JSON schema</a><span>Use the schema to check a configuration file, or to set up an editor.</span></p>'
    )
  );
  for (const surface of catalogue.surfaces) {
    fs.writeFileSync(
      path.join(outputDirectory, surfaceDirectory(surface), `${slug(surface.id)}.html`),
      surfacePage(surface)
    );
  }
  fs.writeFileSync(
    path.join(outputDirectory, 'build-info.html'),
    layout(
      'Build information',
      `<div class="page-head">
  <p class="eyebrow">Build information</p>
  <h1>Build information</h1>
  <p class="lede">This page shows the data about this build of the reference. No page links to it.</p>
</div>
<dl class="fact-list">
  <div><dt>Schema version</dt><dd><code>${escapeHtml(catalogue.schemaVersion)}</code></dd></div>
  <div><dt>Published contracts</dt><dd>${catalogue.surfaces.length}</dd></div>
  <div><dt>Source commit</dt><dd><a href="${REPOSITORY_URL}/commit/${escapeHtml(catalogue.sourceCommit)}"><code>${escapeHtml(catalogue.sourceCommit)}</code></a></dd></div>
  <div><dt>Build time</dt><dd><time datetime="${escapeHtml(catalogue.generatedAt)}">${escapeHtml(catalogue.generatedAt)}</time></dd></div>
</dl>`,
      '.',
      'none',
      true
    )
  );
  fs.writeFileSync(
    path.join(outputDirectory, 'index.html'),
    layout(
      'Start',
      `<div class="page-head">
  <p class="eyebrow">ReDBox developer documentation</p>
  <h1>Extension contracts and form contracts</h1>
  <p class="lede">This site shows the contracts that you use to extend ReDBox. The build tools make each page from the source code. Select a section to start.</p>
</div>
<div class="cards">
  <article class="card"><h2><a href="extensions/index.html">Extensions</a></h2><p>Read the hook protocol, the base contracts, the services, the controllers and the routes.</p></article>
  <article class="card"><h2><a href="forms/index.html">Form configuration</a></h2><p>Read the FormConfig contract and each form component. Each page has an example that the build tools test.</p></article>
  <article class="card"><h2><a href="api/index.html">REST API</a></h2><p>Open the REST API reference. A different tool makes this reference from the OpenAPI description.</p></article>
  <article class="card"><h2>Machine-readable data</h2><ul class="card-links">
    <li><a href="artifacts/catalogue.json" download>Catalogue in JSON</a></li>
    <li><a href="artifacts/catalogue.md" download>Catalogue in Markdown</a></li>
    <li><a href="schemas/form-config.schema.json" download>FormConfig JSON schema</a></li>
  </ul></article>
</div>`,
      '.',
      'home'
    )
  );
}
