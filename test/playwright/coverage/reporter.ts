import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import type { FullConfig, FullResult, Reporter, Suite, TestCase } from '@playwright/test/reporter';
import { applicationManifest, validateApplicationManifest } from './applications';
import { playwrightScenarioIds } from '../../../packages/redbox-hook-dev/src/playwright/catalogue';

const requiredIds = [
  ...Array.from({ length: 19 }, (_, index) => `A${String(index + 1).padStart(2, '0')}`),
  ...Array.from({ length: 30 }, (_, index) => `F${String(index + 1).padStart(2, '0')}`),
];
const idsIn = (test: TestCase): string[] => test.title.match(/\b(?:A(?:0[1-9]|1[0-9])|F(?:0[1-9]|[12][0-9]|30))\b/g) ?? [];

function specFiles(directory: string): string[] {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const file = path.join(directory, entry.name);
    return entry.isDirectory() ? specFiles(file) : entry.name.endsWith('.spec.ts') ? [file] : [];
  });
}

function literalValues(file: string): string[] {
  const scanner = ts.createScanner(ts.ScriptTarget.Latest, true, ts.LanguageVariant.Standard, fs.readFileSync(file, 'utf8'));
  const values: string[] = [];
  for (let token = scanner.scan(); token !== ts.SyntaxKind.EndOfFileToken; token = scanner.scan()) {
    if (token === ts.SyntaxKind.StringLiteral || token === ts.SyntaxKind.NoSubstitutionTemplateLiteral)
      values.push(scanner.getTokenValue());
  }
  return values;
}

export default class CoverageReporter implements Reporter {
  private tests: TestCase[] = [];
  private errors: string[] = [];
  private readonly collection = process.env.PLAYWRIGHT_COVERAGE_COLLECTION === 'true';
  private readonly requireComplete = this.collection || process.env.PLAYWRIGHT_REQUIRE_COMPLETE === 'true';

  onBegin(config: FullConfig, suite: Suite): void {
    this.tests = suite.allTests();
    try {
      validateApplicationManifest();
      if (new Set(playwrightScenarioIds).size !== 30 || playwrightScenarioIds.length !== 30)
        throw new Error('The form catalogue must contain exactly 30 unique scenarios.');
      if (config.workers !== 1 || config.projects.some(project => project.retries !== 0))
        throw new Error('Acceptance requires one worker and zero retries.');
      const prohibited = this.tests.filter(test => test.expectedStatus !== 'passed' || test.annotations.some(annotation => ['skip', 'fixme'].includes(annotation.type)));
      if (prohibited.length) throw new Error(`Skipped or expected-failure tests: ${prohibited.map(test => test.title).join(', ')}`);
      if (this.requireComplete) {
        const unknown = this.tests.flatMap(test => test.title.match(/\b[AF]\d{2,}\b/g) ?? []).filter(id => !requiredIds.includes(id));
        if (unknown.length) throw new Error(`Unknown coverage IDs: ${[...new Set(unknown)].join(', ')}`);
        const collectedFiles = new Set(this.tests.map(test => path.resolve(test.location.file)));
        const emptyFiles = specFiles(config.projects[0].testDir).filter(file => !collectedFiles.has(path.resolve(file)));
        if (emptyFiles.length) throw new Error(`Spec files collected no tests: ${emptyFiles.join(', ')}`);
        const missing = requiredIds.filter(id => !this.tests.some(test => idsIn(test).includes(id)));
        if (missing.length) throw new Error(`Required IDs collected no tests: ${missing.join(', ')}`);
        for (const entry of applicationManifest) {
          const cases = this.tests.filter(test => idsIn(test).includes(entry.id));
          if (!cases.some(test => test.title.includes('useful cold start')) ||
              !cases.some(test => test.title.includes('delayed configuration startup')) ||
              !cases.some(test => path.basename(test.location.file) === entry.journeySpec)) {
            throw new Error(`${entry.id} must collect cold startup, delayed startup and a test in ${entry.journeySpec}.`);
          }
        }
        const literals = [...collectedFiles].flatMap(literalValues);
        const unreferenced = playwrightScenarioIds.filter(id => !literals.some(value => value.includes(id)));
        if (unreferenced.length) throw new Error(`Unreferenced form scenarios: ${unreferenced.join(', ')}`);
      }
    } catch (error) {
      this.errors.push(String(error));
    }
  }

  async onEnd(result: FullResult): Promise<{ status?: FullResult['status'] }> {
    if (!this.collection && this.tests.some(test => test.expectedStatus !== 'passed' || test.results.some(run => run.status === 'skipped')))
      this.errors.push('Required tests must not skip or expect failure at runtime.');
    const coverage = requiredIds.map(id => {
      const cases = this.tests.filter(test => idsIn(test).includes(id));
      return {
        id,
        collected: cases.length,
        passed: this.collection ? null : cases.length > 0 && cases.every(test => test.results.length === 1 && test.results[0].status === 'passed' && test.expectedStatus === 'passed'),
      };
    });
    if (!this.collection && this.requireComplete && coverage.some(item => !item.passed))
      this.errors.push(`Required coverage did not pass: ${coverage.filter(item => !item.passed).map(item => item.id).join(', ')}`);
    const evidence = {
      coverage, errors: this.errors,
      complete: this.errors.length === 0 && (this.collection || coverage.every(item => item.passed)),
      status: result.status, durationMs: result.duration,
      tests: this.tests.map(test => ({ title: test.title, file: path.relative(process.cwd(), test.location.file), ids: idsIn(test), results: test.results.map(run => ({ status: run.status, retry: run.retry, durationMs: run.duration })) })),
    };
    if (this.collection) {
      if (process.env.PLAYWRIGHT_COVERAGE_JSON === 'true') process.stdout.write(`${JSON.stringify(evidence, null, 2)}\n`);
      else if (!this.errors.length) process.stdout.write(`Playwright collection valid: 19 applications, 30 form scenarios, ${this.tests.length} tests.\n`);
    } else {
      fs.mkdirSync('.tmp/playwright/coverage', { recursive: true });
      fs.writeFileSync('.tmp/playwright/coverage/required-ids.json', JSON.stringify(evidence, null, 2));
    }
    for (const error of this.errors) process.stderr.write(`${error}\n`);
    return this.errors.length ? { status: 'failed' } : {};
  }
}
