import { of } from 'rxjs';

import { launch, type HTTPRequest, type Page, type PDFOptions as PuppeteerPDFOptions } from 'puppeteer';
import { DateTime } from 'luxon';
import * as fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'path';
import { Datastream, DatastreamService } from '@researchdatabox/redbox-core/extensions/storage';
import type { BrandingModel } from '@researchdatabox/redbox-core/extensions/storage';
import { Duration, Effect, Fiber } from 'effect';
import type { PdfgenConfig, PdfgenPDFOptions } from '../../config/pdfgen';
import {
  BrowserError,
  DatastreamSaveError,
  InvalidReadinessOptionError,
  MissingBrandError,
  MissingTokenError,
  PDFError,
  PDFRenderError,
} from './PDFErrors';
import { IntegrationAuditContext, PdfIntegrationAuditAction, PdfIntegrationAuditName, createPdfAudit } from './audit';

type PDFGenerationResult =
  | {
      outcome: 'generated';
      fileId: string;
      pdfBufferSize: number;
    }
  | {
      outcome: 'duplicateSuppressed';
    };

type PdfRecord = Record<string, unknown> & {
  oid?: string;
  metaMetadata?: {
    brandId?: string;
  };
};

type PdfOptions = Record<string, unknown> & {
  triggerSource?: string;
};

type PdfgenRuntimePDFOptions = PdfgenPDFOptions & {
  path?: string;
};

import type { PDFDependencies } from '../../dependencies';

function getAuditBrandId(record: PdfRecord): string | undefined {
  const brandId = record.metaMetadata?.brandId;
  return brandId == null ? undefined : String(brandId);
}

function createShutdownInterruptionError(oid: string): Error {
  const error = new Error(`PDF generation interrupted during service shutdown for ${oid}`);
  error.name = 'PDFGenerationInterruptedError';
  return error;
}

export namespace Services {
  /**
   * WorkflowSteps related functions...
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   *
   */
  export class PDF {
    protected active = false;
    private stopping = false;
    private drained = false;
    private get audit() {
      return createPdfAudit(this.dependencies.audit);
    }
    private readonly retainedCleanups = new Map<object | string, () => Promise<void>>();
    public constructor(private readonly dependencies: PDFDependencies) {}
    public async initialize(): Promise<void> {}
    public async activate(): Promise<void> {
      if (this.stopping) throw new Error('PDF owner is stopping.');
      this.active = true;
    }
    public quiesce(): void {
      this.active = false;
      this.stopping = true;
    }
    public async drain(): Promise<void> {
      this.quiesce();
      await this.shutdownPDFRetries();
      for (const [resource, close] of this.retainedCleanups) {
        await close();
        this.retainedCleanups.delete(resource);
      }
      this.drained = true;
    }
    public async close(): Promise<void> {
      if (!this.drained) await this.drain();
      this.processMap.clear();
    }
    private async releaseOwned(resource: object | string, close: () => Promise<void>): Promise<void> {
      this.retainedCleanups.set(resource, close);
      try {
        await close();
        this.retainedCleanups.delete(resource);
      } catch {
        this.dependencies.log.warn('PDF cleanup retained; application stop will retry.');
      }
    }

    private processMap: Set<string> = new Set<string>();
    private retryTasks: Map<
      string,
      {
        token: symbol;
        fiber?: Fiber.RuntimeFiber<void, never>;
        interruptReason?: 'shutdown' | 'superseded';
      }
    > = new Map();
    private generationTasks: Set<Fiber.RuntimeFiber<void, never>> = new Set();
    private DatastreamService?: Pick<DatastreamService, 'addDatastream'>;
    public async shutdownPDFRetries(): Promise<void> {
      await Promise.all(Array.from(this.generationTasks).map(fiber => Effect.runPromise(Fiber.interrupt(fiber))));
      await Promise.all(
        Array.from(this.retryTasks.values()).map(async task => {
          task.interruptReason = 'shutdown';
          if (task.fiber) await Effect.runPromise(Fiber.interrupt(task.fiber));
        })
      );
    }

    private cancelPendingRetry(currentURL: string): void {
      const task = this.retryTasks.get(currentURL);
      if (task == null) {
        return;
      }
      task.interruptReason = 'superseded';
      if (task.fiber != null) {
        Effect.runPromise(Fiber.interrupt(task.fiber)).catch(_error => {
          this.dependencies.log.warn('PDFService::Failed to interrupt superseded PDF retry task.');
        });
      }
    }

    private logWarn(message: string) {
      return Effect.sync(() => this.dependencies.log.warn(message)).pipe(Effect.zipRight(Effect.logWarning(message)));
    }

    private logError(message: string) {
      return Effect.sync(() => this.dependencies.log.error(message)).pipe(Effect.zipRight(Effect.logError(message)));
    }

    private logDebug(message: string) {
      return Effect.sync(() => this.dependencies.log.debug(message)).pipe(Effect.zipRight(Effect.logDebug(message)));
    }

    private isRetryable(error: PDFError): boolean {
      return error._tag === 'BrowserError' || error._tag === 'PDFRenderError' || error._tag === 'DatastreamSaveError';
    }

    protected launchBrowser(options: Parameters<typeof launch>[0]) {
      return launch(options);
    }

    private async waitForPageReady(
      page: Page,
      brand: BrandingModel,
      options: PdfOptions,
      readinessStrategy: string
    ): Promise<void> {
      const timeout = this.getOption(brand, options, 'readinessTimeout', 60000);

      switch (readinessStrategy) {
        case 'networkIdle':
          await page.waitForNetworkIdle({
            idleTime: this.getOption(brand, options, 'networkIdleTime', 2000),
            timeout,
          });
          break;
        case 'selector':
          await page.waitForSelector(this.getOption<string>(brand, options, 'waitForSelector') ?? '', { timeout });
          break;
        case 'jsFlag':
          await page.waitForFunction(this.getOption<string>(brand, options, 'waitForFunction') ?? '', {
            timeout,
            polling: 500,
          });
          break;
        case 'networkIdle+selector':
          await page.waitForNetworkIdle({
            idleTime: this.getOption(brand, options, 'networkIdleTime', 2000),
            timeout,
          });
          await page.waitForSelector(this.getOption<string>(brand, options, 'waitForSelector') ?? '', { timeout });
          break;
        default:
          this.dependencies.log.warn(
            `PDFService::Unknown readinessStrategy '${readinessStrategy}', falling back to networkIdle`
          );
          await page.waitForNetworkIdle({
            idleTime: this.getOption(brand, options, 'networkIdleTime', 2000),
            timeout,
          });
          break;
      }
    }

    private attemptPDFGeneration(
      oid: string,
      record: PdfRecord,
      options: PdfOptions,
      brand: BrandingModel,
      attempt: number,
      parentAuditCtx?: IntegrationAuditContext | null
    ): Effect.Effect<PDFGenerationResult, PDFError> {
      // Resolve URL / option metadata up-front so that the audit `requestSummary`
      // describes what we're about to attempt regardless of whether the browser
      // launch ever succeeds.
      const sourceUrlBase = this.getSourceUrlBase(brand, options);
      const pdfgenAppUrlOverride = this.getOption(brand, options, 'appUrlOverride');
      const baseUrl = pdfgenAppUrlOverride || this.dependencies.config.appUrl;
      const currentURL = `${baseUrl}${sourceUrlBase}/${oid}`;
      const readinessStrategy = this.getOption<string>(brand, options, 'readinessStrategy', 'networkIdle');
      const pdfPrefix = this.getOption(brand, options, 'pdfPrefix', 'pdf');

      const work = Effect.scoped(
        Effect.gen(this, function* () {
          if (readinessStrategy === 'selector' || readinessStrategy === 'networkIdle+selector') {
            const waitForSelector = this.getOption(brand, options, 'waitForSelector');
            if (typeof waitForSelector !== 'string' || waitForSelector.trim() === '') {
              return yield* Effect.fail(new InvalidReadinessOptionError(oid, readinessStrategy, 'waitForSelector'));
            }
          }

          if (readinessStrategy === 'jsFlag') {
            const waitForFunction = this.getOption(brand, options, 'waitForFunction');
            if (typeof waitForFunction !== 'string' || waitForFunction.trim() === '') {
              return yield* Effect.fail(new InvalidReadinessOptionError(oid, readinessStrategy, 'waitForFunction'));
            }
          }

          yield* Effect.sync(() =>
            this.dependencies.log.verbose(`PDFService::Creating PDF for: ${oid} (Attempt ${attempt})`)
          );

          const token = this.getOption(brand, options, 'token');
          if (!token) {
            yield* this.logWarn(`PDFService::API token for PDF generation is not set. Skipping generation: ${oid}`);
            return yield* Effect.fail(new MissingTokenError(oid));
          }

          const claimedRequest = yield* Effect.acquireRelease(
            Effect.sync(() => {
              if (this.processMap.has(currentURL)) {
                return false;
              }
              this.processMap.add(currentURL);
              return true;
            }),
            claimed =>
              claimed
                ? Effect.sync(() => {
                    this.processMap.delete(currentURL);
                  })
                : Effect.void
          );

          if (!claimedRequest) {
            yield* this.logWarn(
              `PDFService::PDF generation already in progress for ${currentURL}, skipping duplicate request.`
            );
            return {
              outcome: 'duplicateSuppressed' as const,
            };
          }

          const tmpUserDataDir = yield* Effect.acquireRelease(
            Effect.tryPromise({
              try: () => fs.mkdtemp(path.join(os.tmpdir(), 'pdfgen')),
              catch: cause => new BrowserError(oid, '', cause),
            }),
            dir => Effect.promise(() => this.releaseOwned(dir, () => fs.rm(dir, { recursive: true, force: true })))
          );

          const executablePath =
            process.env.PUPPETEER_EXECUTABLE_PATH ||
            ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome-stable'].find(candidate =>
              existsSync(candidate)
            );

          const browser = yield* Effect.acquireRelease(
            Effect.tryPromise({
              try: () =>
                this.launchBrowser({
                  headless: true,
                  executablePath,
                  args: ['--no-sandbox', `--user-data-dir=${tmpUserDataDir}`],
                }),
              catch: cause => new BrowserError(oid, '', cause),
            }),
            instance => Effect.promise(() => this.releaseOwned(instance, () => instance.close()))
          );

          const page = yield* Effect.acquireRelease(
            Effect.tryPromise({
              try: () => browser.newPage(),
              catch: cause => new BrowserError(oid, '', cause),
            }),
            instance => Effect.promise(() => this.releaseOwned(instance, () => instance.close()))
          );

          const expectedUrl = yield* Effect.try({
            try: () => new URL(currentURL),
            catch: cause => new BrowserError(oid, currentURL, cause),
          });
          const isRecordUrl = (url: string): boolean => {
            try {
              const candidate = new URL(url);
              return (
                candidate.origin === expectedUrl.origin &&
                candidate.pathname === expectedUrl.pathname &&
                candidate.search === expectedUrl.search
              );
            } catch {
              return false;
            }
          };
          const loginPath = `/${(this.dependencies.config.loginPath || 'user/login').replace(/^\/+|\/+$/g, '')}`;
          const isAuthenticationRedirect = (url: URL): boolean => {
            const pathname = url.pathname.replace(/\/+$/, '');
            return (
              pathname === loginPath ||
              pathname.endsWith(loginPath) ||
              /^\/user\/(?:login(?:_[^/]*)?|begin_oidc)$/.test(pathname)
            );
          };
          let blockedNavigationUrl: string | undefined;
          let latestNavigationRequest: HTTPRequest | undefined;

          // A page-wide Authorization header follows redirects and can reach other
          // origins. Attach the token only to requests for this portal instead.
          yield* Effect.tryPromise({
            try: async () => {
              page.on('request', request => {
                const requestUrl = new URL(request.url());
                if (request.isNavigationRequest() && request.frame() === page.mainFrame()) {
                  latestNavigationRequest = request;
                  if (requestUrl.origin !== expectedUrl.origin) {
                    blockedNavigationUrl = request.url();
                    void request.abort('blockedbyclient').catch((_error: unknown) => {
                      this.dependencies.log.warn('PDFService::Failed to block off-origin navigation.');
                    });
                    return;
                  }
                }

                const headers = request.headers();
                for (const name of Object.keys(headers)) {
                  if (name.toLowerCase() === 'authorization') {
                    delete headers[name];
                  }
                }
                if (requestUrl.origin === expectedUrl.origin) {
                  headers['Authorization'] = `Bearer ${token}`;
                }
                void request.continue({ headers }).catch((_error: unknown) => {
                  this.dependencies.log.warn('PDFService::Failed to continue PDF page request.');
                });
              });
              await page.setRequestInterception(true);
            },
            catch: cause => new BrowserError(oid, currentURL, cause),
          });

          const enableLogging = this.getOption(brand, options, 'enableChromeLogging');
          if (enableLogging === true || enableLogging === 'true') {
            yield* Effect.sync(() => {
              page.on('console', () => {
                this.dependencies.log.verbose('PDFService::Chrome console activity.');
              });
              page.on('pageerror', () => {
                this.dependencies.log.error('PDFService::Chrome page error.');
              });
              page.on('response', response => {
                this.dependencies.log.verbose(`PDFService::Chrome response status: ${response.status()}`);
              });
              page.on('requestfailed', () => {
                this.dependencies.log.error('PDFService::Chrome request failed.');
              });
            });
          }

          yield* Effect.sync(() => {
            this.dependencies.log.verbose(`PDFService::sourceUrlBase ${sourceUrlBase}`);
            this.dependencies.log.verbose(`PDFService::pdfgen.appUrlOverride ${pdfgenAppUrlOverride}`);
          });

          yield* this.logDebug(`PDFService::Chromium loading page: ${currentURL}`);

          const initialNavigationResponse = yield* Effect.tryPromise({
            try: () => page.goto(currentURL, { waitUntil: 'domcontentloaded' }),
            catch: cause =>
              new BrowserError(
                oid,
                currentURL,
                blockedNavigationUrl
                  ? new Error(`Blocked navigation outside the portal: ${blockedNavigationUrl}`)
                  : cause
              ),
          }).pipe(Effect.withSpan('navigatePage', { attributes: { oid, attempt, url: currentURL } }));

          const validateNavigation = () => {
            if (blockedNavigationUrl) {
              throw new Error(`Blocked navigation outside the portal: ${blockedNavigationUrl}`);
            }
            // A reload can replace the document without changing its URL. A pending
            // navigation must not fall back to an earlier successful response.
            const navigationResponse = latestNavigationRequest
              ? latestNavigationRequest.response()
              : initialNavigationResponse;
            if (navigationResponse == null) {
              throw new Error('Record navigation returned no response');
            }
            if (navigationResponse.status() < 200 || navigationResponse.status() >= 300) {
              throw new Error(`Record navigation returned HTTP ${navigationResponse.status()}`);
            }
            const redirectUrls = navigationResponse
              .request()
              .redirectChain()
              .map(request => request.url());
            for (const url of redirectUrls) {
              let redirectUrl: URL;
              try {
                redirectUrl = new URL(url);
              } catch (cause) {
                throw new Error(`Record navigation contained an invalid redirect URL: ${url}`, { cause });
              }
              if (redirectUrl.origin !== expectedUrl.origin) {
                throw new Error(`Record navigation left the portal origin: ${url}`);
              }
              if (isAuthenticationRedirect(redirectUrl)) {
                throw new Error(`Record navigation redirected through authentication: ${url}`);
              }
            }
            for (const url of [navigationResponse.url(), page.url()]) {
              if (!isRecordUrl(url)) {
                throw new Error(`Record navigation left the expected record route: ${url}`);
              }
            }
          };

          yield* Effect.try({
            try: validateNavigation,
            catch: cause => new BrowserError(oid, currentURL, cause),
          });

          yield* Effect.tryPromise({
            try: () => this.waitForPageReady(page, brand, options, readinessStrategy),
            catch: cause => new BrowserError(oid, currentURL, cause),
          }).pipe(
            Effect.withSpan('waitForPageReady', {
              attributes: {
                oid,
                attempt,
                strategy: readinessStrategy,
              },
            })
          );

          // The page can navigate again while the readiness strategy is waiting.
          yield* Effect.try({
            try: validateNavigation,
            catch: cause => new BrowserError(oid, currentURL, cause),
          });

          yield* Effect.sync(() =>
            this.dependencies.log.verbose(`PDFService::Page ready: ${currentURL}, generating PDF...`)
          );

          const date = DateTime.now().toMillis();
          const fileId = `${pdfPrefix ? `${pdfPrefix}-` : ''}${oid}-${date}.pdf`;

          const rawPdfOptions = this.getOption<PdfgenRuntimePDFOptions>(brand, options, 'PDFOptions') || {};
          const { path: _ignoredPath, ...pdfOptions } = rawPdfOptions;

          const defaultPDFOptions: PuppeteerPDFOptions = {
            format: 'A4',
            printBackground: true,
            ...pdfOptions,
          };

          const pdfBuffer = yield* Effect.tryPromise({
            try: () => page.pdf(defaultPDFOptions),
            catch: cause => new PDFRenderError(oid, cause),
          }).pipe(Effect.withSpan('renderPDFBuffer', { attributes: { oid, attempt } }));

          yield* this.logDebug(`PDFService::Generated PDF buffer`);
          yield* Effect.sync(() => this.dependencies.log.verbose(`PDFService::Saving PDF: ${oid}`));

          const stagingDisk = this.dependencies.stagingDisk();
          yield* Effect.tryPromise({
            try: () => stagingDisk.put(fileId, pdfBuffer),
            catch: cause => new DatastreamSaveError(oid, cause),
          }).pipe(
            Effect.uninterruptible,
            Effect.withSpan('saveToDatastream', { attributes: { oid, attempt, fileId } })
          );

          const datastream = new Datastream({ fileId: fileId, name: fileId });
          yield* Effect.tryPromise({
            try: () =>
              (this.DatastreamService ?? this.dependencies.datastreams).addDatastream(oid, datastream, stagingDisk),
            catch: cause => new DatastreamSaveError(oid, cause),
          }).pipe(
            Effect.uninterruptible,
            Effect.catchAll(error =>
              Effect.promise(() => stagingDisk.delete(fileId)).pipe(
                Effect.catchAll(() => Effect.void),
                Effect.zipRight(Effect.fail(error))
              )
            )
          );

          yield* this.logDebug(`PDFService::Saved PDF to storage: ${oid}`);

          return {
            outcome: 'generated' as const,
            fileId,
            pdfBufferSize: (pdfBuffer as Buffer | Uint8Array | { length?: number })?.length ?? 0,
          };
        })
      ).pipe(Effect.withSpan('generatePDF', { attributes: { oid, attempt, brand: brand.name } }));

      // Audit lifecycle wrapper. `startPdfAudit` returns null when the injected
      // `IntegrationAuditService` is absent, so the helpers no-op gracefully
      // and PDF generation behaviour is unchanged in non-audit environments.
      return Effect.suspend(() => {
        // Distinguish the initial attempt (treated as the original trigger) from
        // retry attempts. A parent context alone isn't enough — `createPDF` always
        // creates a parent and threads it into attempt 1 so the child links into
        // the trace. The retry signal is `attempt > 1`.
        const childTriggeredBy = attempt > 1 ? 'pdfRetry' : 'createPDF';
        const auditCtx = this.audit.startPdfAudit(
          oid,
          PdfIntegrationAuditAction.generatePdf,
          {
            integrationName: PdfIntegrationAuditName,
            brandId: getAuditBrandId(record),
            triggeredBy: childTriggeredBy,
            requestSummary: {
              attempt,
              url: currentURL,
              sourceUrlBase,
              readinessStrategy,
              pdfPrefix,
            },
          },
          parentAuditCtx
        );
        let auditClosed = false;
        const closeAudit = (close: () => void): void => {
          if (auditClosed) {
            return;
          }
          auditClosed = true;
          close();
        };

        return Effect.matchEffect(work, {
          onSuccess: result =>
            Effect.sync(() => {
              if (result?.outcome === 'duplicateSuppressed') {
                closeAudit(() => {
                  this.audit.completePdfAudit(auditCtx, {
                    message: 'PDF generation skipped because a duplicate request was already in progress.',
                    responseSummary: {
                      outcome: result.outcome,
                      attempt,
                    },
                  });
                });
                return;
              }
              closeAudit(() => {
                this.audit.completePdfAudit(auditCtx, {
                  message: 'PDF generated successfully.',
                  responseSummary: {
                    outcome: result?.outcome,
                    fileId: result?.fileId,
                    pdfBufferSize: result?.pdfBufferSize,
                    attempt,
                  },
                });
              });
            }).pipe(Effect.as(result)),
          onFailure: (error: PDFError) =>
            Effect.sync(() => {
              closeAudit(() => {
                this.audit.failPdfAudit(auditCtx, error, {
                  message: 'PDF generation failed.',
                  responseSummary: {
                    errorTag: error._tag,
                    url: currentURL,
                    cause:
                      (error as { cause?: unknown }).cause instanceof Error
                        ? ((error as { cause?: Error }).cause as Error).message
                        : undefined,
                    attempt,
                  },
                });
              });
            }).pipe(Effect.zipRight(Effect.fail(error))),
        }).pipe(
          Effect.onInterrupt(() =>
            Effect.sync(() => {
              const error = createShutdownInterruptionError(oid);
              closeAudit(() => {
                this.audit.failPdfAudit(auditCtx, error, {
                  message: 'PDF generation interrupted during service shutdown.',
                  responseSummary: {
                    errorTag: error.name,
                    url: currentURL,
                    attempt,
                  },
                });
              });
            })
          )
        );
      });
    }

    private getBrandingEffect(record: PdfRecord): Effect.Effect<BrandingModel, MissingBrandError> {
      return Effect.gen(this, function* () {
        const brandId = record.metaMetadata?.brandId;
        const brand = brandId == null ? undefined : this.dependencies.brandById(String(brandId));
        if (brand == null) {
          return yield* Effect.fail(new MissingBrandError(record.oid ?? '', brandId));
        }
        return brand;
      });
    }

    private getOption<T>(
      branding: BrandingModel,
      option: PdfOptions | undefined,
      key: keyof PdfgenConfig | string,
      defaultValue: T
    ): T;
    private getOption<T = unknown>(
      branding: BrandingModel,
      option: PdfOptions | undefined,
      key: keyof PdfgenConfig | string,
      defaultValue?: T
    ): T | undefined;
    private getOption<T>(
      branding: BrandingModel,
      option: PdfOptions | undefined,
      key: keyof PdfgenConfig | string,
      defaultValue?: T
    ): T | undefined {
      const brandingConfig = this.dependencies.optionsForBrand(branding.name);
      let value: unknown = brandingConfig[key];
      if (option && option[key] !== undefined) {
        value = option[key];
      }
      if (value === undefined) {
        return defaultValue;
      }
      return value as T;
    }

    private getSourceUrlBase(brand: BrandingModel, options: PdfOptions): string {
      const configuredSourceUrlBase = this.getOption<string>(brand, options, 'sourceUrlBase');
      return typeof configuredSourceUrlBase === 'string' && configuredSourceUrlBase.trim() !== ''
        ? configuredSourceUrlBase
        : `/${brand.name}/rdmp/record/view`;
    }

    public createPDF(oid: string, record: PdfRecord, options: PdfOptions, _user: unknown) {
      if (!this.active || this.stopping) throw new Error('PDF processing requires active application admission.');
      const effect = Effect.gen(this, function* () {
        const brand = yield* this.getBrandingEffect({ ...record, oid });
        const maxRetries = this.getOption(brand, options, 'maxRetries', 2);
        const baseDelayMs = this.getOption(brand, options, 'retryDelayMs', 5000);
        const multiplier = this.getOption(brand, options, 'retryBackoffMultiplier', 2);
        const sourceUrlBase = this.getSourceUrlBase(brand, options);
        const pdfgenAppUrlOverride = this.getOption(brand, options, 'appUrlOverride');
        const baseUrl = pdfgenAppUrlOverride || this.dependencies.config.appUrl;
        const currentURL = `${baseUrl}${sourceUrlBase}/${oid}`;
        const triggerSource =
          options && typeof options === 'object' && typeof options.triggerSource === 'string'
            ? options.triggerSource
            : 'createPDF';

        // Parent audit span — links every attempt under one trace so a single
        // createPDF lifecycle (initial attempt + any background retries) is
        // visible as one trace in the audit dashboard. Returns null when the
        // injected IntegrationAuditService is absent.
        const parentAuditCtx = this.audit.startPdfAudit(oid, PdfIntegrationAuditAction.generatePdfTrigger, {
          integrationName: PdfIntegrationAuditName,
          brandId: getAuditBrandId(record),
          triggeredBy: triggerSource,
          requestSummary: {
            maxRetries,
            baseDelayMs,
            multiplier,
            triggerSource,
          },
        });

        let attemptsRun = 0;
        let parentClosed = false;
        const closeParent = (finalStatus: 'success' | 'failed' | 'skipped' | 'pending', error?: unknown) => {
          if (parentClosed) {
            return;
          }
          parentClosed = true;
          if (finalStatus === 'failed' && error != null) {
            this.audit.failPdfAudit(parentAuditCtx, error, {
              message: 'PDF generation pipeline failed.',
              responseSummary: { attemptsRun, finalStatus },
            });
            return;
          }
          this.audit.completePdfAudit(parentAuditCtx, {
            message:
              finalStatus === 'skipped' ? 'PDF generation pipeline skipped.' : 'PDF generation pipeline completed.',
            responseSummary: {
              attemptsRun,
              finalStatus,
              ...(error instanceof MissingTokenError ? { errorTag: error._tag } : {}),
            },
          });
        };

        const runBackgroundRetries = (
          retryToken: symbol,
          remainingRetries: number,
          nextAttempt: number
        ): Effect.Effect<void, never> =>
          Effect.gen(this, function* () {
            const retryTask = this.retryTasks.get(currentURL);
            if (retryTask?.token !== retryToken) {
              closeParent('skipped');
              return;
            }
            const retryIndex = maxRetries - remainingRetries;
            const delayMs = baseDelayMs * Math.pow(multiplier, retryIndex);
            yield* this.logWarn(
              `PDFService::Scheduling retry ${nextAttempt - 1} of ${maxRetries} for ${oid} in ${delayMs}ms`
            );
            yield* Effect.sleep(Duration.millis(delayMs));
            if (this.retryTasks.get(currentURL)?.token !== retryToken) {
              closeParent('skipped');
              return;
            }
            attemptsRun += 1;
            yield* this.attemptPDFGeneration(oid, record, options, brand, nextAttempt, parentAuditCtx).pipe(
              Effect.matchEffect({
                onSuccess: result =>
                  Effect.sync(() => closeParent(result.outcome === 'duplicateSuppressed' ? 'skipped' : 'success')),
                onFailure: (error: PDFError) => {
                  if (this.isRetryable(error)) {
                    if (remainingRetries === 1) {
                      return this.logError(`PDFService::Max retries exhausted for ${oid} or non-retryable error.`).pipe(
                        Effect.zipRight(Effect.sync(() => closeParent('failed', error)))
                      );
                    }
                    return runBackgroundRetries(retryToken, remainingRetries - 1, nextAttempt + 1);
                  }
                  return this.logWarn(`PDFService::non-retryable failure, skipping`).pipe(
                    Effect.zipRight(Effect.sync(() => closeParent('failed', error)))
                  );
                },
              })
            );
          });

        attemptsRun += 1;
        return yield* this.attemptPDFGeneration(oid, record, options, brand, 1, parentAuditCtx).pipe(
          Effect.matchEffect({
            onSuccess: result =>
              Effect.sync(() => {
                if (result.outcome === 'duplicateSuppressed') {
                  closeParent('skipped');
                  return;
                }
                this.cancelPendingRetry(currentURL);
                closeParent('success');
              }),
            onFailure: (error: PDFError) => {
              if (this.isRetryable(error)) {
                if (maxRetries <= 0) {
                  return Effect.sync(() => {
                    this.dependencies.log.error(`PDFService::Max retries exhausted for ${oid}, no remaining retries.`);
                    closeParent('failed', error);
                  });
                }
                return Effect.gen(this, function* () {
                  yield* this.logWarn(
                    `PDFService::Best-effort generation failed for ${oid}, but not blocking workflow. Retry scheduled: true. Error: ${error?.name} - ${error?.message}`
                  );
                  const retryToken = Symbol(currentURL);
                  this.retryTasks.set(currentURL, { token: retryToken });
                  const retryEffect = runBackgroundRetries(retryToken, maxRetries, 2).pipe(
                    Effect.onInterrupt(() =>
                      Effect.sync(() => {
                        const task = this.retryTasks.get(currentURL);
                        if (task?.token !== retryToken) {
                          return;
                        }
                        if (task.interruptReason === 'shutdown') {
                          closeParent('failed', new Error('PDF retry interrupted during service shutdown'));
                          return;
                        }
                        closeParent('skipped');
                      })
                    ),
                    Effect.ensuring(
                      Effect.sync(() => {
                        const task = this.retryTasks.get(currentURL);
                        if (task?.token === retryToken) {
                          this.retryTasks.delete(currentURL);
                        }
                      })
                    )
                  );
                  yield* Effect.sync(() => {
                    void this.dependencies
                      .runAcceptedWork(async () => {
                        const fiber = Effect.runFork(retryEffect);
                        const retryTask = this.retryTasks.get(currentURL);
                        if (retryTask?.token === retryToken) retryTask.fiber = fiber;
                        else await Effect.runPromise(Fiber.interrupt(fiber));
                        await Effect.runPromise(Fiber.await(fiber));
                      })
                      .catch(_error => this.dependencies.log._error('PDFService::Retry ownership failed.'));
                  });
                });
              }

              if (error._tag === 'MissingTokenError') {
                return this.logWarn(
                  `PDFService::Best-effort generation failed for ${oid}, but not blocking workflow. Retry scheduled: false. Error: ${error?.name} - ${error?.message}`
                ).pipe(Effect.zipRight(Effect.sync(() => closeParent('skipped', error))));
              }

              return this.logWarn(
                `PDFService::Best-effort generation failed for ${oid}, but not blocking workflow. Retry scheduled: false. Error: ${error?.name} - ${error?.message}`
              ).pipe(Effect.zipRight(Effect.sync(() => closeParent('failed', error))));
            },
          }),
          Effect.as(record),
          Effect.withSpan('createPDF', { attributes: { oid, brand: brand.name } }),
          Effect.onInterrupt(() =>
            Effect.sync(() => {
              closeParent('failed', createShutdownInterruptionError(oid));
            })
          )
        );
      });

      void this.dependencies
        .runAcceptedWork(async () => {
          const generationFiber = Effect.runFork(
            effect.pipe(
              Effect.catchAllCause(_cause => this.logError(`PDFService::Background PDF generation failed for ${oid}.`)),
              Effect.asVoid
            )
          );
          this.generationTasks.add(generationFiber);
          try {
            await Effect.runPromise(Fiber.await(generationFiber));
          } finally {
            this.generationTasks.delete(generationFiber);
          }
        })
        .catch(_error => this.dependencies.log._error('PDFService::Generation ownership failed.'));

      return of(record);
    }
  }
}
