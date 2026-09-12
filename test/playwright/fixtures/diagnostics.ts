import fs from 'node:fs/promises';
import { fontStylesheetUrls } from './stubs';
import type { BrowserContext, Page, TestInfo } from '@playwright/test';

export type ExpectedBrowserFailure = {
  kind: 'pageerror' | 'console' | 'requestfailed' | 'response';
  method?: string;
  url?: string | RegExp;
  status?: number;
  message?: string | RegExp;
  count?: number;
  reason: string;
};

export type BrowserDiagnostic = {
  kind: ExpectedBrowserFailure['kind'] | 'external-request';
  url?: string;
  method?: string;
  status?: number;
  message: string;
  timestamp: string;
};

function matches(value: string | undefined, expected: string | RegExp | undefined): boolean {
  if (!expected) return true;
  if (value === undefined) return false;
  if (typeof expected === 'string') return value === expected;
  expected.lastIndex = 0;
  const matched = expected.test(value);
  expected.lastIndex = 0;
  return matched;
}

export class BrowserDiagnostics {
  private readonly diagnostics: BrowserDiagnostic[] = [];
  private readonly expectations: Array<{ spec: ExpectedBrowserFailure; matched: number }> = [];
  private readonly attachedPages = new WeakSet<Page>();
  private readonly attachedContexts = new WeakSet<BrowserContext>();
  private readonly allowedOrigins = new Set([
    new URL(process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:1500').origin,
    new URL(process.env.PLAYWRIGHT_BROWSER_STUB_URL ?? 'http://playwright-stubs:8787').origin,
    new URL(process.env.PLAYWRIGHT_STUB_URL ?? 'http://playwright-stubs:8787').origin,
  ]);

  constructor(
    private readonly context: BrowserContext,
    private readonly testInfo: TestInfo
  ) {
    this.attachContext(this.context);
  }

  private attachContext(context: BrowserContext): void {
    if (this.attachedContexts.has(context)) return;
    this.attachedContexts.add(context);
    context.on('page', page => this.attach(page));
    context.on('request', request => {
      const url = new URL(request.url());
      if (/^https?:$/.test(url.protocol) && !this.allowedOrigins.has(url.origin) && !fontStylesheetUrls.has(url.href)) {
        this.diagnostics.push({ kind: 'external-request', url: request.url(), method: request.method(),
          message: 'Request origin is outside the configured portal and local stub service.', timestamp: new Date().toISOString() });
      }
    });
    for (const page of context.pages()) this.attach(page);
  }

  attach(page: Page): void {
    if (this.attachedPages.has(page)) return;
    this.attachedPages.add(page);
    this.attachContext(page.context());
    const add = (diagnostic: BrowserDiagnostic): void => {
      this.diagnostics.push(diagnostic);
    };
    page.on('pageerror', error =>
      add({ kind: 'pageerror', message: error.message, timestamp: new Date().toISOString() })
    );
    page.on('console', message => {
      const text = message.text();
      if (message.type() === 'error')
        add({ kind: 'console', url: message.location().url, message: text, timestamp: new Date().toISOString() });
    });
    page.on('requestfailed', request =>
      add({
        kind: 'requestfailed',
        url: request.url(),
        method: request.method(),
        message: request.failure()?.errorText ?? 'request failed',
        timestamp: new Date().toISOString(),
      })
    );
    page.on('response', response => {
      if (response.status() >= 400)
        add({
          kind: 'response',
          url: response.url(),
          method: response.request().method(),
          status: response.status(),
          message: response.statusText(),
          timestamp: new Date().toISOString(),
        });
    });
  }

  expectFailure(spec: ExpectedBrowserFailure): void {
    if (!spec.reason.trim() || !Number.isInteger(spec.count ?? 1) || (spec.count ?? 1) < 1)
      throw new Error('Expected diagnostics require a reason and a positive exact count.');
    this.expectations.push({ spec, matched: 0 });
  }

  private match(diagnostic: BrowserDiagnostic, spec: ExpectedBrowserFailure): boolean {
    return (
      diagnostic.kind === spec.kind &&
      matches(diagnostic.url, spec.url) &&
      matches(diagnostic.method, spec.method) &&
      (spec.status === undefined || diagnostic.status === spec.status) &&
      matches(diagnostic.message, spec.message)
    );
  }

  async flush(): Promise<void> {
    const consumed = new Set<number>();
    for (const diagnostic of this.diagnostics) {
      const expectationIndex = this.expectations.findIndex(
        item => this.match(diagnostic, item.spec) && item.matched < (item.spec.count ?? 1)
      );
      if (expectationIndex >= 0) {
        this.expectations[expectationIndex].matched += 1;
        consumed.add(this.diagnostics.indexOf(diagnostic));
      }
    }
    const unused = this.expectations.filter(item => item.matched !== (item.spec.count ?? 1));
    const unexpected = this.diagnostics.filter((_, index) => !consumed.has(index));
    const evidence = { testId: this.testInfo.testId, diagnostics: this.diagnostics, expectations: this.expectations };
    await this.testInfo.attach('browser-diagnostics.json', {
      body: JSON.stringify(evidence, (_key, value) => value instanceof RegExp ? value.toString() : value, 2),
      contentType: 'application/json',
    });
    if (this.testInfo.outputDir) {
      await fs.mkdir(this.testInfo.outputDir, { recursive: true });
      await fs.writeFile(`${this.testInfo.outputDir}/browser-diagnostics.json`, JSON.stringify(evidence, (_key, value) => value instanceof RegExp ? value.toString() : value, 2));
    }
    if (unused.length || unexpected.length) {
      const details = [
        ...unused.map(item => `unused expected ${item.spec.kind}: ${item.spec.reason}`),
        ...unexpected.map(item => `unexpected ${item.kind}: ${item.url ?? item.message}`),
      ];
      throw new Error(`Unexpected browser diagnostics for ${this.testInfo.testId}:\n${details.join('\n')}`);
    }
  }
}
