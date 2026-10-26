"""Reproduce the R23 page/block/reference inventory; no source files are executed."""
import argparse
import hashlib
import html
import json
import pathlib
import re
import subprocess

PORTAL = pathlib.Path(__file__).resolve().parents[5]
WSU = pathlib.Path('/home/andrew/src/bitbucket/redbox-hook-wsu-v6')
OUT = PORTAL / '.tmp/sails-retirement/final-review-r23'


def pages(root):
    tracked = subprocess.check_output(['git', '-C', str(root), 'ls-files', '-z']).decode().split('\0')
    if root == WSU:
        return sorted(p for p in tracked if p.endswith('.md'))
    return sorted(p for p in tracked if (
        p.startswith('support/wiki/') and p.endswith('.md')
        or p in ('README.md', 'CONTRIBUTING.md', 'AGENTS.md')
        or p.startswith('support/specs/sails-retirement/') and p.endswith('-v6.md')
        or '/skills/' in p and p.endswith('.md')
        or pathlib.PurePosixPath(p).name in ('AGENTS.md', 'CLAUDE.md')
        or p.startswith(('.claude/', '.agents/')) and p.endswith('.md')
        or pathlib.PurePosixPath(p).name.lower() in ('readme.md', '_readme.md', 'readme.md.hbs')
        and not p.startswith(('support/specs/', 'support/spikes/'))
    ))


def extract(text):
    items = []
    covered = []
    for pattern, kind in [
        (r'^[ \t]*(`{3,}|~{3,})([^\n]*)\n([\s\S]*?)^[ \t]*\1\s*$', 'code'),
        (r'<pre>\s*<code[^>]*>([\s\S]*?)</code>\s*</pre>', 'html-code'),
    ]:
        for m in re.finditer(pattern, text, re.M):
            items.append({'line': text.count('\n', 0, m.start()) + 1, 'kind': kind,
                          'text': html.unescape(m[3] if kind == 'code' else m[1]),
                          'language': m[2].strip() if kind == 'code' else 'js'})
            covered.append((m.start(), m.end()))
    # Keep every inline code span and HTML code span, including config keys, paths,
    # packages, commands and API names. Also catch unquoted runtime/path terms.
    pattern = r'`([^`\n]+)`|<code[^>]*>([^<]+)</code>|\b(?:sails(?:\.[\w.]+)?|(?:\w+/)+[\w.*-]+|[A-Z]\w*(?:Service|Controller)|(?:Controllers|Services)\.[\w.]+)\b'
    for m in re.finditer(pattern, text):
        if any(a <= m.start() < b for a, b in covered):
            continue
        items.append({'line': text.count('\n', 0, m.start()) + 1, 'kind': 'reference',
                      'text': html.unescape(m[1] or m[2] or m[0])})
    for m in re.finditer(r'\]\(([^)\n]+)\)|(?:href|src)="([^"]+)"', text):
        if not any(a <= m.start() < b for a, b in covered):
            items.append({'line': text.count('\n', 0, m.start()) + 1,
                          'kind': 'link', 'text': html.unescape(m[1] or m[2])})
    # Preserve each complete sample and also enumerate names inside it. This
    # makes package/API/config-key/path checks individually addressable.
    for item in list(items):
        if item['kind'] not in ('code', 'html-code'):
            continue
        patterns = {
            'package': r'@(?:researchdatabox|angular|uppy|prisma)/[\w./-]+|(?:from\s+|require\()[\'\"]([^\'\"]+)[\'\"]',
            'class': r'\b[A-Z][A-Za-z0-9]*(?:Service|Controller|Config|Model|Repository|Handler)\b',
            'api-or-key': r'(?<![\w])(?:[A-Za-z_$][\w$]*\.)+[A-Za-z_$][\w$]*|^\s*[\'\"]?([A-Za-z_$][\w$.-]*)[\'\"]?\s*:',
            'path': r'(?<![\w/])(?:packages|support|typescript|config|api|test|angular|assets|views|language-defaults)/[\w/.*()<>-]+',
            'command': r'\bnpm run [\w:-]+|\b(?:node|bash|npx) [^\n]+',
        }
        for kind, pattern in patterns.items():
            for match in re.finditer(pattern, item['text'], re.M):
                items.append({'line': item['line'] + (1 if item['kind'] == 'code' else 0) + item['text'].count('\n', 0, match.start(1) if match.lastindex and match[1] else match.start()),
                              'kind': kind, 'text': match[1] if match.lastindex else match[0],
                              'sampleLine': item['line']})
    return sorted(items, key=lambda i: (i['line'], i['kind']))


def run():
    parser = argparse.ArgumentParser()
    parser.add_argument('--incoming', action='store_true')
    args = parser.parse_args()
    OUT.mkdir(parents=True, exist_ok=True)
    rows = []
    for root in (PORTAL, WSU):
        for page in pages(root):
            revision = 'f22474ec4' if root == PORTAL else '80b2b80'
            data = subprocess.check_output(['git', '-C', str(root), 'show', f'{revision}:{page}']).decode() if args.incoming else (root / page).read_text()
            rows.append({'repo': 'portal' if root == PORTAL else 'wsu', 'page': page,
                         'sha256': hashlib.sha256(data.encode()).hexdigest(), 'items': extract(data)})
    prefix = 'incoming-' if args.incoming else ''
    target = OUT / f'{prefix}documentation-extracted.json'
    target.write_text(json.dumps(rows, indent=2) + '\n')
    print(json.dumps({'pages': len(rows), 'items': sum(len(r['items']) for r in rows),
                      'codeBlocks': sum(i['kind'] in ('code', 'html-code') for r in rows for i in r['items'])}))
    paths = []
    for row in rows:
        root = PORTAL if row['repo'] == 'portal' else WSU
        for item in row['items']:
            for match in re.finditer(r'(?<![\w/])(?:packages|support|typescript|config|api|test|angular|assets|views|language-defaults)/[\w/.*()-]+', item['text']):
                p = match[0].rstrip('.,)')
                if not any(c in p for c in '*()') and not (root / p).exists():
                    paths.append({'page': row['page'], 'line': item['line'], 'path': p})
    (OUT / f'{prefix}missing-path-candidates.json').write_text(json.dumps(paths, indent=2) + '\n')


if __name__ == '__main__':
    run()
