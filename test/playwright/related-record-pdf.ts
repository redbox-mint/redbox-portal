import { expect, chromium, type Cookie } from '@playwright/test';
import { writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import path from 'node:path';

const pdfRequire = createRequire(path.resolve('packages/sails-hook-redbox-pdfgen/package.json'));
const { Effect, Cause } = pdfRequire('effect');
const {
  installPdfgenTestGlobals,
  clearPdfgenTestGlobals,
} = require('../../packages/sails-hook-redbox-pdfgen/test/support/globals');
const { relatedPlanPdf } = require('../../packages/redbox-hook-dev/src/config/related-record-examples');

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
        values: string[];
        state: string | null;
        rows: { title: string; startDate: string; endDate: string }[];
        dates: string[];
      }
    | undefined;
  let printed = false;
  let requiredState: string | null = null;
  let controlledPage: any;
  let delayRequests = false;
  let releaseFetch!: () => void;
  const fetchGate = new Promise<void>(resolve => {
    releaseFetch = resolve;
  });
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
      // Delay the actual POST while retaining PDFService's auth/navigation interception.
      const on = page.on.bind(page);
      page.on = (event: string, handler: (...args: any[]) => void) => {
        if (event === 'request')
          return on(event, async (request: any) => {
            if (delayRequests && request.url().includes('/relatedMetadata/resolve')) await fetchGate;
            handler(request);
          });
        return on(event, handler);
      };
      const goto = page.goto.bind(page);
      page.goto = async (...args: any[]) => {
        const response = await goto(...args);
        await page.waitForSelector('redbox-form[data-rb-related-state="ready"]');
        await page.waitForFunction(() => {
          const form = (window as any).ng?.getComponent(document.querySelector('redbox-form'));
          return form?.form?.get('activitySummaries')?.value?.length === 2;
        });
        await options.changeSource();
        delayRequests = true;
        await page.evaluate((requiredError: boolean) => {
          const runtime = window as any;
          const form = runtime.ng.getComponent(document.querySelector('redbox-form'));
          const summaries = form.form.get('activitySummaries');
          if (!requiredError) {
            const setter = summaries.customValueSetter.bind(summaries);
            summaries.customValueSetter = async (value: unknown[], opts: unknown) => {
              if (value.length) {
                runtime.__rr20SetterStarted = true;
                await new Promise<void>(resolve => {
                  runtime.__rr20ReleaseSetter = resolve;
                });
              }
              return setter(value, opts);
            };
          }
          const sources = Array.from(document.querySelectorAll('redbox-related-object-data')).map(element =>
            runtime.ng.getComponent(element)
          );
          for (const source of sources) {
            if (requiredError && source.componentDefinition.config.relationId === 'primaryActivity') {
              source.descriptor.required = true;
            }
            // Fire existing component refreshes, allowing PDFService itself to perform readiness waits.
            void source.refreshRelatedData(true);
          }
        }, !!options.requiredError);
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
        preprint = await page.evaluate(() => ({
          rows: Array.from(document.querySelectorAll('.rb-form-repeatable-item'))
            .filter(row =>
              Array.from(row.querySelectorAll('label')).some(label => label.textContent?.trim() === 'Activity title')
            )
            .map(row => {
              const value = (name: string) => {
                const label = Array.from(row.querySelectorAll('label')).find(
                  label => label.textContent?.trim() === name
                ) as HTMLLabelElement;
                return (document.getElementById(label.htmlFor) as HTMLInputElement).value;
              };
              return { title: value('Activity title'), startDate: value('Start date'), endDate: value('End date') };
            }),
          dates: ['Start date', 'End date'].map(name => {
            const label = Array.from(document.querySelectorAll('redbox-form label')).find(
              label => label.textContent?.trim() === name
            ) as HTMLLabelElement;
            return (document.getElementById(label.htmlFor) as HTMLInputElement).value;
          }),
          text: document.body.innerText,
          values: Array.from(
            document.querySelectorAll<HTMLInputElement | HTMLTextAreaElement>('redbox-form input, redbox-form textarea')
          ).map(input => input.value),
          state: document.querySelector('redbox-form')!.getAttribute('data-rb-related-state'),
        }));
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
      releaseFetch();
      if (options.requiredError) {
        await controlledPage.waitForFunction(
          () => document.querySelector('redbox-form')?.getAttribute('data-rb-related-state') === 'error'
        );
        requiredState = await controlledPage.$eval('redbox-form', (element: Element) =>
          element.getAttribute('data-rb-related-state')
        );
      } else {
        await controlledPage.waitForFunction('window.__rr20SetterStarted === true');
        expect(printed, 'network completion must not outrun the asynchronous repeatable setter').toBe(false);
        expect(
          await controlledPage.$eval('redbox-form', (el: Element) => el.getAttribute('data-rb-related-state'))
        ).toBe('pending');
        await controlledPage.evaluate(() => (window as any).__rr20ReleaseSetter());
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
      if (options.wait) {
        expect(preprint!.state).toBe('ready');
        expect(preprint!.dates).toEqual(['2027-02-01', '2027-03-01']);
        expect(preprint!.rows).toEqual([
          { title: 'PDF final activity', startDate: '2027-02-01', endDate: '2027-03-01' },
          { title: 'Activity B', startDate: '2025-02-01', endDate: '2025-03-01' },
        ]);
        expect(preprint!.text).toContain('PDF final activity');
        expect(preprint!.text).toContain('2027-02-01');
        expect(preprint!.text).toContain('2027-03-01');
        expect(preprint!.text).toContain('Activity B');
        expect(preprint!.values).toContain('PDF final activity');
        expect(preprint!.text).not.toMatch(/loading|no accessible activities/i);
      } else {
        expect(preprint!.state).toBe('pending');
        expect(preprint!.text).not.toContain('PDF final activity');
        expect(preprint!.values).not.toContain('PDF final activity');
      }
    }
  } finally {
    releaseFetch();
    abort.abort();
    await generation;
    await service.shutdownPDFRetries();
    clearPdfgenTestGlobals();
  }
}
