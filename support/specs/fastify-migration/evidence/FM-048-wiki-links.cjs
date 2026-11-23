'use strict';

const { execFileSync } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const MarkdownIt = require('markdown-it');

const root = path.resolve(__dirname, '../../../..');
const wiki = 'support/wiki';
const markdown = new MarkdownIt({ html: true, linkify: true });
const trackedPages = new Set(
  execFileSync('git', ['ls-files', '-z', '--', wiki], { cwd: root, encoding: 'utf8' })
    .split('\0')
    .filter(file => file.endsWith('.md'))
);
const documents = new Map();

function readMarkdown(file) {
  if (!documents.has(file)) {
    const source = fs.readFileSync(path.join(root, file), 'utf8');
    documents.set(file, { source, tokens: markdown.parse(source, {}) });
  }
  return documents.get(file);
}

function headings(file) {
  const document = readMarkdown(file);
  if (document.headings) return document.headings;

  const anchors = new Set();
  for (const [index, token] of document.tokens.entries()) {
    if (token.type !== 'heading_open') continue;
    const title = document.tokens[index + 1].children
      .filter(child => ['text', 'code_inline', 'image'].includes(child.type))
      .map(child => child.content)
      .join('');
    const slug = title.toLowerCase().trim().replace(/[^\p{L}\p{M}\p{N}\p{Zs}_-]/gu, '').replace(/\p{Zs}/gu, '-');
    let id = slug;
    for (let duplicate = 1; anchors.has(id); duplicate++) id = slug + '-' + duplicate;
    anchors.add(id);
  }
  for (const tag of document.source.matchAll(/<(?:a|h[1-6])\b[^>]*\b(?:id|name)=['"]([^'"]+)['"]/gi)) {
    anchors.add(tag[1]);
  }
  document.headings = anchors;
  return anchors;
}

const navigationPages = new Set([
  'Home.md',
  'Development-Guide.md',
  'User-Guide.md',
  'Form-Configuration-Recipes.md',
  'ReDBox-Portal-API.md',
  'REST-API-Documentation.md',
]);
const navigationName =
  /^(?:_?(?:sidebar|footer|home|readme|sitemap)|_?(?:index|nav(?:igation)?|toc|table-of-contents)(?:[-_].*)?|.+[-_](?:index|nav(?:igation)?|toc))\.md$/i;
// Each exception needs the exact source path, destination and a reason.
// Values are maps from complete URLs to reasons. There are no exceptions.
const navigationWikiAllowlist = new Map();

function githubWikiPage(address) {
  if (!/^(?:https?:)?\/\//i.test(address)) return null;
  const url = URL.parse(address, 'https://github.com');
  if (!url || !/^(?:www\.)?github\.com\.?$/i.test(url.hostname)) return null;
  return /^\/([^/]+\/[^/]+)\/wiki(?:\/(.*))?$/i.exec(decodeURIComponent(url.pathname));
}

const failures = [];
let relativeLinks = 0;
let githubLinks = 0;
let fragments = 0;

function checkLink(destination, file, line) {
  if (!destination) return;
  const [location, fragment] = destination.split('#', 2);
  const address = location.split('?')[0];
  const github = githubWikiPage(address);
  let target = file;
  if (github) {
    githubLinks++;
    const name = path.basename(file);
    const isNavigation = navigationPages.has(name) || navigationName.test(name);
    if (isNavigation && !navigationWikiAllowlist.get(file)?.get(destination)?.trim()) {
      failures.push(file + ':' + line + ' navigation must link to the tracked wiki: ' + destination);
      return;
    }
    if (github[1].toLowerCase() !== 'redbox-mint/redbox-portal') return;
    const page = (github[2] || 'Home').replace(/\/$/, '');
    target = path.join(wiki, page + '.md');
    if (!trackedPages.has(target)) {
      failures.push(file + ':' + line + ' GitHub Wiki URL has no tracked page: ' + destination);
      return;
    }
  } else {
    if (/^(?:[a-z][a-z\d+.-]*:|\/\/)/i.test(address)) return;
    relativeLinks++;
    const pathname = decodeURIComponent(address);
    if (pathname) {
      target = pathname.startsWith('/')
        ? path.normalize(pathname.slice(1))
        : path.join(path.dirname(file), pathname);
    }
  }
  if (!fs.existsSync(path.join(root, target))) {
    failures.push(file + ':' + line + ' missing local path: ' + destination);
  } else if (fragment && target.endsWith('.md')) {
    fragments++;
    if (!headings(target).has(decodeURIComponent(fragment))) {
      failures.push(file + ':' + line + ' missing Markdown heading: ' + destination);
    }
  }
}

function checkToken(token, file, line) {
  if (token.type === 'link_open') checkLink(token.attrGet('href'), file, line);
  if (token.type === 'image') checkLink(token.attrGet('src'), file, line);
  if (token.type === 'html_block' || token.type === 'html_inline') {
    for (const match of token.content.matchAll(/(?:^|\s)(?:href|src)\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+))/gi)) {
      checkLink(markdown.utils.unescapeAll(match[1] ?? match[2] ?? match[3]), file, line);
    }
  }
  for (const child of token.children ?? []) checkToken(child, file, line);
}

for (const file of trackedPages) {
  let line = 1;
  for (const token of readMarkdown(file).tokens) {
    if (token.map) line = token.map[0] + 1;
    checkToken(token, file, line);
  }
}

console.log(
  trackedPages.size + ' wiki pages, ' + relativeLinks + ' local links, ' + githubLinks +
    ' GitHub Wiki links, ' + fragments + ' Markdown fragments, ' + failures.length + ' broken'
);
for (const failure of failures) console.error(failure);
process.exitCode = failures.length ? 1 : 0;
