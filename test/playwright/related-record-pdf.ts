import { expect, chromium, type Cookie } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

/** Real PDFService + Puppeteer + actual portal/Angular page. Only storage and timing are test doubles. */
export async function relatedPdfProof(options: {
  outputDir: string;
  baseURL: string;
  oid: string;
  cookies: Cookie[];
  wait: boolean;
  requiredError?: boolean;
  changeSource: () => Promise<unknown>;
}) {
  // Load compiled server helpers only when the PDF proof runs inside the test image.
  const pdfRequire = createRequire(path.resolve('packages/sails-hook-redbox-pdfgen/package.json'));
  const { Effect, Cause } = pdfRequire('effect');
  const {
    installPdfgenTestGlobals,
    clearPdfgenTestGlobals,
  } = require('../../packages/sails-hook-redbox-pdfgen/test/support/globals');
  const { relatedPlanPdf } = require('../../packages/redbox-hook-dev/src/config/related-record-examples');

  const name = options.requiredError ? 'pdf-required-error' : options.wait ? 'pdf-ready' : 'pdf-without-wait';
  const globals = globalThis as any;
  installPdfgenTestGlobals({ appUrl: options.baseURL });
  const { Services } = pdfRequire('./dist/api/services/PDFService.js');
  const service = new Services.PDF() as any;
  service.DatastreamService = globals.sails.services.standarddatastreamservice;
  const put = globals.StorageManagerService.stagingDisk().put;
  let preprint:
    | {
        text: string;
        relatedText: string;
        primaryTitle: string;
        controls: number;
        renderComplete: boolean;
        state: string | null;
        rows: { title: string; startDate: string; endDate: string }[];
        dates: string[];
      }
    | undefined;
  let printed = false;
  let requiredState: string | null = null;
  let controlledPage: any;
  let baseReady!: () => void;
  const ready = new Promise<void>(resolve => {
    baseReady = resolve;
  });
  const launch = service.launchBrowser.bind(service);
  service.launchBrowser = async (launchOptions: object) => {
    const browser = await launch({ ...launchOptions, executablePath: chromium.executablePath() });
    const newPage = browser.newPage.bind(browser);
    browser.newPage = async () => {
      const page = await newPage();
      controlledPage = page;
      page.on('pageerror', (error: Error) => console.log('PDF browser error:', error.message));
      page.on('console', (message: any) => {
        if (message.type() === 'error') console.log('PDF console:', message.text());
      });
      await page.setCookie(
        ...options.cookies.map(({ name, value, domain, path: cookiePath, httpOnly, secure, sameSite }) => ({
          name,
          value,
          domain,
          path: cookiePath,
          httpOnly,
          secure,
          sameSite,
        }))
      );
      const goto = page.goto.bind(page);
      page.goto = async (...args: any[]) => {
        const response = await goto(...args);
        await page.waitForSelector('redbox-form[data-rb-related-state="ready"]');
        await page.waitForFunction(() => {
          const table = Array.from(document.querySelectorAll('redbox-content table')).find(
            table => table.querySelector('th')?.textContent?.trim() === 'Activity title'
          );
          return table?.querySelectorAll('tbody tr').length === 2;
        });
        await options.changeSource();
        await page.evaluate((requiredError: boolean) => {
          const runtime = window as any;
          const form = runtime.ng.getComponent(document.querySelector('redbox-form'));
          const source = runtime.ng.getComponent(document.querySelector('redbox-related-object-data'));
          const prototype = Object.getPrototypeOf(source);
          const refresh = prototype.refreshRelatedData;
          prototype.refreshRelatedData = function (...args: unknown[]) {
            if (requiredError && this.componentDefinition.config.relationId === 'primaryActivity') {
              this.descriptor.required = true;
            }
            return refresh.apply(this, args);
          };
          const render = prototype.refreshContent;
          prototype.refreshContent = async function () {
            const config = this.componentDefinition.config;
            const target = requiredError
              ? config.relationId === 'primaryActivity'
              : config.template?.includes('<h3>Current activities</h3>');
            if (target && this.result && !this.result.loading) {
              runtime.__rr20RenderStarted = true;
              await new Promise<void>(resolve => {
                runtime.__rr20ReleaseRender = resolve;
              });
            }
            await render.call(this);
            if (target) runtime.__rr20RenderCompleted = true;
          };
          // View targets are server-hydrated content, with no editable reference or
          // repeatable controls. Reload through the real form API to reread the
          // changed source, then hold its actual asynchronous content renderer.
          void form.downloadAndCreateFormComponents().catch((error: unknown) => {
            runtime.__rr20ReloadError = String(error);
          });
        }, !!options.requiredError);
        await page.waitForFunction(() => {
          const runtime = window as any;
          if (runtime.__rr20ReloadError) throw new Error(runtime.__rr20ReloadError);
          return (
            runtime.__rr20RenderStarted === true &&
            document.querySelector('redbox-form')?.getAttribute('data-rb-related-state') === 'pending'
          );
        });
        return response;
      };
      const selector = page.waitForSelector.bind(page);
      page.waitForSelector = async (...args: any[]) => {
        const result = await selector(...args);
        // Only the service's configured base readiness selector signals the driver.
        if (args[0] === 'redbox-form') baseReady();
        return result;
      };
      const pdf = page.pdf.bind(page);
      page.pdf = async (...args: any[]) => {
        printed = true;
        preprint = await page.evaluate(() => {
          const table = Array.from(document.querySelectorAll('redbox-content table')).find(
            table => table.querySelector('th')?.textContent?.trim() === 'Activity title'
          );
          const primary = Array.from(document.querySelectorAll('.rb-form-field-layout')).find(
            field => field.querySelector('.rb-form-field-label')?.textContent?.trim() === 'Primary activity'
          );
          const related = Array.from(document.querySelectorAll<HTMLElement>('redbox-related-object-data')).find(
            source => source.querySelector('h3')?.textContent?.trim() === 'Current activities'
          );
          return {
            rows: Array.from(table?.querySelectorAll('tbody tr') ?? []).map(row => {
              const cells = Array.from(row.querySelectorAll('td')).map(cell => cell.textContent?.trim() ?? '');
              return { title: cells[0], startDate: cells[1], endDate: cells[2] };
            }),
            dates: Array.from(document.querySelectorAll('redbox-content .rb-view-group .rb-view-value')).map(
              value => value.textContent?.trim() ?? ''
            ),
            primaryTitle: primary?.querySelector('.rb-form-content')?.textContent?.trim() ?? '',
            relatedText: related?.innerText ?? '',
            text: document.body.innerText,
            controls: document.querySelectorAll('redbox-form input, redbox-form textarea, redbox-form select').length,
            renderComplete: (window as any).__rr20RenderCompleted === true,
            state: document.querySelector('redbox-form')!.getAttribute('data-rb-related-state'),
          };
        });
        await writeFile(path.join(options.outputDir, `${name}-dom.json`), JSON.stringify(preprint, null, 2));
        await page.screenshot({ path: path.join(options.outputDir, `${name}.png`), fullPage: true });
        const buffer = await pdf(...args);
        await writeFile(path.join(options.outputDir, `${name}.pdf`), buffer);
        return buffer;
      };
      const close = page.close.bind(page);
      page.close = async () => {
        await page.screenshot({ path: path.join(options.outputDir, `${name}-closing.png`), fullPage: true });
        await writeFile(path.join(options.outputDir, `${name}-closing.html`), await page.content());
        return close();
      };
      return page;
    };
    return browser;
  };
  const abort = new AbortController();
  let generation: Promise<any> | undefined;
  try {
    generation = Effect.runPromiseExit(
      service.attemptPDFGeneration(
        options.oid,
        {},
        {
          ...relatedPlanPdf,
          token: 'rr20-isolated-pdf-token',
          // Selector readiness isolates the extra related-data wait from network-idle waiting.
          readinessStrategy: 'selector',
          waitForSelector: 'redbox-form',
          readinessTimeout: 20_000,
          waitForRelatedData: options.wait,
        },
        { name: 'default' },
        1
      ),
      { signal: abort.signal }
    );
    await Promise.race([
      ready,
      generation.then((exit: any) => {
        if (exit._tag === 'Failure')
          throw new Error(`${JSON.stringify(exit)} ${String(Cause.failureOption(exit.cause).value?.cause?.stack)}`);
      }),
    ]);
    if (options.wait) {
      expect(printed).toBe(false);
      expect(await controlledPage.$eval('redbox-form', (el: Element) => el.getAttribute('data-rb-related-state'))).toBe(
        'pending'
      );
      expect(await controlledPage.evaluate(() => (window as any).__rr20RenderStarted)).toBe(true);
      expect(printed, 'server hydration must not outrun the asynchronous related content renderer').toBe(false);
      await controlledPage.evaluate(() => (window as any).__rr20ReleaseRender());
      if (options.requiredError) {
        await controlledPage.waitForFunction(
          () => document.querySelector('redbox-form')?.getAttribute('data-rb-related-state') === 'error'
        );
        requiredState = await controlledPage.$eval('redbox-form', (element: Element) =>
          element.getAttribute('data-rb-related-state')
        );
      }
    }
    const exit = await generation;
    if (options.requiredError) {
      expect(exit._tag).toBe('Failure');
      const failure = Cause.failureOption(exit.cause);
      expect(failure.value._tag).toBe('BrowserError');
      // Puppeteer can report a thrown polling predicate as a readiness timeout.
      // The actual error marker plus no print/storage proves the required-source failure path.
      expect(requiredState).toBe('error');
      expect(printed).toBe(false);
      expect(put.called).toBe(false);
    } else {
      expect(exit._tag, JSON.stringify(exit)).toBe('Success');
      expect(exit.value.pdfBufferSize).toBeGreaterThan(1000);
      expect(put.calledOnce).toBe(true);
      expect(preprint).toBeDefined();
      expect(preprint!.controls, 'PDF uses the view content presentation').toBe(0);
      if (options.wait) {
        expect(preprint!.state).toBe('ready');
        expect(preprint!.renderComplete).toBe(true);
        expect(preprint!.dates).toEqual(['2027-02-01', '2027-03-01']);
        expect(preprint!.rows).toEqual([
          { title: 'PDF final activity', startDate: '2027-02-01', endDate: '2027-03-01' },
          { title: 'Activity B', startDate: '2025-02-01', endDate: '2025-03-01' },
        ]);
        expect(preprint!.text).toContain('PDF final activity');
        expect(preprint!.text).toContain('2027-02-01');
        expect(preprint!.text).toContain('2027-03-01');
        expect(preprint!.text).toContain('Activity B');
        expect(preprint!.primaryTitle).toBe('PDF final activity');
        expect(preprint!.relatedText).toContain('PDF final activity: 2027-02-01 – 2027-03-01');
        expect(preprint!.relatedText).toContain('Activity B: 2025-02-01 – 2025-03-01');
        expect(preprint!.text).not.toMatch(/loading|no accessible activities/i);
      } else {
        expect(preprint!.state).toBe('pending');
        // Server hydration and form subscriptions can already display fresh values.
        // The opt-out still prints before the tracked asynchronous work settles.
        expect(preprint!.renderComplete).toBe(false);
      }
    }
  } finally {
    if (controlledPage && !controlledPage.isClosed()) {
      await controlledPage.evaluate(() => (window as any).__rr20ReleaseRender?.()).catch(() => {});
    }
    abort.abort();
    await generation;
    await service.shutdownPDFRetries();
    clearPdfgenTestGlobals();
  }
}
