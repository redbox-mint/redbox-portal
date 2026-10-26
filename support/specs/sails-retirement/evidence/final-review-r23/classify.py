"""Attach the R23 review dispositions to every extracted item and page.

These are documentary review classifications, not a claim that prose/fixtures
were executed. See verification.md for actual execution and prerequisite limits.
"""
import collections
import gzip
import importlib.util
import json
import pathlib
import re
import subprocess
import sys

sys.dont_write_bytecode = True

HERE = pathlib.Path(__file__).resolve().parent
spec = importlib.util.spec_from_file_location('inventory', HERE / 'inventory.py')
inv = importlib.util.module_from_spec(spec)
spec.loader.exec_module(inv)

# Each regex is scoped to an affected page family. Whole samples are wrong when
# they contain a wrong instruction; constituent names retain their own rows.
A = [
 ('R23-01', r'(?:support/wiki/(?:AppConfig-Secrets|Configuring-(?:Record-Forms|Record-Types-in-ReDBox|Lookup-\(Mint\)-Records|Email-Notifications|Record-Workflows|Related-Records|the-search-page-for-a-record-type)|Server-Side-Form-Validation-Operations|Record-Schema-Contract-Operations|Using-a-Repeatable-Contributor-Component-to-Define-Record-Permissions)\.md|packages/sails-hook-redbox-pdfgen/README.md)', r'config/(?:env|local|form|recordtype|workflow|emailnotification|recordValidation|recordSchema|solr|vocab|dashboardtype|pdfgen)|sails_branding|branded-config|form\.forms|formConfigRegistry|defaultForm'),
 ('R23-02', r'^README.md$', r'npm run dev:run'),
 ('R23-03', r'^README.md$', r'STARTUP_TIMING|SHIM_VERBOSE|node app\.js'),
 ('R23-04', r'Request-Chronicle-Logging.md$', r'Controllers\.Core\.Controller|this\.|sendResp|recordBackgroundOperation'),
 ('R23-05', r'(TUS-and-Uppy-Companion-Setup|Uppy-and-TUS-Architecture).md$', r'config/|companionAttachmentUploadAuth|sails|UPPY_|CompanionService|ServerService|csrf|attachmentSecret'),
 ('R23-06', r'^packages/redbox-dev-tools/skills/', r'Controllers\.Core\.Controller|_exportedMethods|sendResp|CacheService\.getNgAppFileHash|RenderViewController\.render|config/(?:form|workflow|recordtype)\.js|Sails lifted|Sails \+ EJS|\bsails\b(?!-ng|-hook)|SHIM|registerRedbox|core/src/controllers|config/routes'),
 ('R23-07', r'Configuring-Dashboard-Tables.md$', r'REDBOX_SKIP_MIGRATIONS|REDBOX_DASHBOARD_MIGRATION_RESOLUTIONS|dashboard-config/migration/preflight'),
 ('R23-08', r'(Cache-Persistence(?:-Hook-Migration)?\.md|packages/sails-hook-redbox-(?:storage-mongo|pdfgen)/README.md)$', r'preLiftSetup|registerRedboxServices|registerRedboxConfig|Sails|IntegrationAuditService|PDFAudit|24\.16\.0|REDBOX_SKIP_MIGRATIONS'),
 ('R23-09', r'Figshare-Service-Technical-Guide.md$', r'sails|_exportedMethods'),
 ('R23-10', r'^support/specs/sails-retirement/configuration-v6.md$', r'const config = await loadDeploymentConfiguration'),
]
B = [
 (r'Data-Migrations.md$', r'npx redbox-dev-tools'),
 (r'Translation-Updates-Runbook.md$', r'packages/redbox-dev-tools/dist/bin/redbox-dev-tools.js'),
 (r'/skills/', r'RBPORTAL_MOCHA_TESTS|test/unit/services/.*\.js|typescript/test/|support/wiki/redbox-core.md|test/bruno/(?:general|run)|generate_(?:angular_app|angular_service|form_field)'),
 (r'translation-content-format-metadata.md$', r'/Users/andrewbrazzatti/'),
 (r'(Configuring-Record-Types-in-ReDBox|Configuring-Related-Records).md$', r'Improved-Related-Record-Handling'),
 (r'Figshare-Service-Technical-Guide.md$', r'packages/redbox-core/test/migrations/figshare-(?:categories-crosswalk-binding|drop-unused-config-keys)\.test.ts'),
]


def proof(page):
    if '/skills/' in page:
        return ['test/tooling/retirement-docs.test.cjs', 'packages/redbox-dev-tools/src/cli.ts', 'support/wiki/Controllers-Architecture.md', 'B-17 (inherited exceptions)']
    if 'WSU' in page or page in ('docs/dashboard-sorting.md', 'support/v6/README.md'):
        return ['WSU src/extension.ts', 'WSU package.json', 'R21 HTTP matrix', 'R22 entrypoint matrix']
    if any(word in page.lower() for word in ['form', 'record', 'dashboard', 'query', 'lookup', 'email', 'figshare', 'raid', 'oni', 'related', 'workflow', 'solr']):
        return ['packages/redbox-core/src/configuration/portal.ts', 'packages/redbox-core/src/services', 'packages/sails-ng-common/src', 'angular/projects/researchdatabox/form/src/app', 'R13 configuration/HTTP acceptance ledgers']
    if 'Companion' in page or 'Uppy' in page:
        return ['packages/redbox-core/src/http/express/companion.ts', 'packages/redbox-core/src/http/express/resumableUploads.ts', 'packages/redbox-core/src/application/portal/http.ts', 'test/tooling/retirement-docs.test.cjs']
    return ['package.json', 'packages/redbox-core/src', 'packages/redbox-dev-tools/src', 'support/development', 'R20-R22 settlements (historical execution only)']


def classify(row, item, data, incoming):
    page, text = row['page'], item['text']
    if row['repo'] == 'portal':
        if incoming and page.endswith('Record-Schema-Contract-Operations.md') and 39 <= item['line'] <= 43:
            return 'wrong', 'R23-01', 'Retired startup coercion: the selected module must supply an actual boolean.'
        if '/skills/' in page and 'redbox-testing/' in page and text.strip() == 'npm run test:mocha':
            return 'wrong', 'B-17', 'Command exists; the surrounding nonmount CI interpretation is inherited and wrong.'
        for path, pattern in B:
            if re.search(path, page) and re.search(pattern, text):
                return 'wrong', 'B-17', 'Inherited at a49366803; retained backlog, not a new retirement finding.'
        if page.endswith('Server-Side-Form-Validation-Operations.md') and item['kind'] == 'code' and 'module.exports.recordValidation' in text:
            return 'wrong', 'B-17', 'Inherited combined full module/record-type fragment is not standalone JavaScript.'
        if incoming:
            for finding, path, pattern in A:
                if re.search(path, page) and re.search(pattern, text):
                    return 'wrong', finding, 'Instruction invalidated by retirement; replaced and regression checked in R23.'
    # Retired tokens are historical only where the document explicitly calls out
    # conversion, removal or v5. A current converter call itself remains current.
    lines = data.splitlines()
    context = '\n'.join(lines[max(0, item['line'] - 5):item['line'] + 4])
    old = re.search(r'\bsails(?!-ng-common|-hook-redbox)(?:[._]|\b)|\bControllers\.|registerRedbox(?:Services|Controllers|Config|Models)|\.sailsrc|\bpreLiftSetup\b|config/(?:hooks|env)|_exportedMethods|TranslationService\.t', text)
    labelled = re.search(r'(?i)legacy|historical|retir|remov|unsupported|before|conver|v5|no implicit|do not', context)
    if old and labelled and not text.startswith(('npm ', 'npx ', 'node ')):
        return 'intentionally historical', None, 'Explicit v5/legacy/removal/migration context; not a supported v6 invocation.'
    if page == 'config/locales/_README.md':
        return 'intentionally historical', None, 'Page explicitly labels this directory as historical v5 input.'
    return 'current', None, 'Current contract or illustrative/parameterized fragment; execution status is separate.'


def run():
    table = ['# R23 documentation page settlement', '',
             'Every item is retained in the two compressed JSON ledgers. C = current; H = explicitly historical; W = wrong. W on the final tree is inherited B-17. Source checks and executions are distinguished in verification.md. Counts include complete samples plus nested names/keys/paths, so they are not counts of independent programs.', '',
             '| Repository/page | Samples | Final C/H/W items | Incoming A findings | Verification/source |',
             '| --- | ---: | --- | --- | --- |']
    incoming_findings = collections.defaultdict(set)
    totals = {}
    for incoming in (True, False):
        rows = json.loads((inv.OUT / (('incoming-' if incoming else '') + 'documentation-extracted.json')).read_text())
        count = collections.Counter()
        for row in rows:
            root = inv.PORTAL if row['repo'] == 'portal' else inv.WSU
            rev = 'f22474ec4' if root == inv.PORTAL else '80b2b80'
            data = subprocess.check_output(['git', '-C', str(root), 'show', f'{rev}:{row["page"]}']).decode() if incoming else (root / row['page']).read_text()
            row['verification'] = proof(row['page']) if row['repo'] == 'portal' else ['WSU package.json', 'WSU src/extension.ts', 'R21 HTTP matrix', 'R22 entrypoint matrix']
            per = collections.Counter()
            for number, item in enumerate(row['items'], 1):
                state, finding, reason = classify(row, item, data, incoming)
                item.update(id=f'{row["repo"]}:{row["page"]}:{number}', classification=state, reason=reason)
                if finding:
                    item['finding'] = finding
                    if finding.startswith('R23-'):
                        incoming_findings[(row['repo'], row['page'])].add(finding)
                per[state] += 1
                count[state] += 1
            if not incoming:
                samples = sum(i['kind'] in ('code', 'html-code') for i in row['items'])
                findings = ', '.join(sorted(incoming_findings[(row['repo'], row['page'])])) or '—'
                table.append(f'| {row["repo"]}: `{row["page"]}` | {samples} | {per["current"]}/{per["intentionally historical"]}/{per["wrong"]} | {findings} | ' + '; '.join(row['verification']) + ' |')
        name = 'incoming-ledger.json.gz' if incoming else 'final-ledger.json.gz'
        (HERE / name).write_bytes(gzip.compress((json.dumps(rows, separators=(',', ':')) + '\n').encode(), mtime=0))
        totals['incoming' if incoming else 'final'] = dict(count)
    (HERE / 'page-settlement.md').write_text('\n'.join(table) + '\n')
    (HERE / 'classification-summary.json').write_text(json.dumps(totals, indent=2) + '\n')
    print(json.dumps(totals))


if __name__ == '__main__':
    run()
