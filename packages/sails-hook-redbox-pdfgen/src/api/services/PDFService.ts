import { from } from 'rxjs';

import { launch } from 'puppeteer';
import { DateTime } from 'luxon';
import * as fs from 'node:fs/promises';
import { existsSync } from 'node:fs';
import * as os from 'node:os';
import * as path from 'path';
import {
  Services as services,
  Datastream,
  DatastreamService
} from '@researchdatabox/redbox-core';
import { Cause, Duration, Effect, Fiber } from 'effect';
import type { PdfgenConfig } from '../../config/pdfgen';
import {
  BrowserError,
  DatastreamSaveError,
  InvalidReadinessOptionError,
  MissingBrandError,
  MissingTokenError,
  PDFError,
  PDFRenderError
} from './PDFErrors';
import {
  completePdfAudit,
  failPdfAudit,
  IntegrationAuditContext,
  PdfIntegrationAuditAction,
  PdfIntegrationAuditName,
  startPdfAudit
} from './PDFAudit';

type PDFGenerationResult =
  | {
      outcome: 'generated';
      fileId: string;
      pdfBufferSize: number;
    }
  | {
      outcome: 'duplicateSuppressed';
    };


export namespace Services {
  /**
   * WorkflowSteps related functions...
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   *
   */
  export class PDF extends services.Core.Service {

    private processMap: Set<string> = new Set<string>();
    private retryTasks: Map<string, {
      token: symbol;
      fiber?: Fiber.RuntimeFiber<void, never>;
      interruptReason?: 'shutdown' | 'superseded';
    }> = new Map();
    private DatastreamService!: DatastreamService;
    protected _exportedMethods: any = [
      'createPDF',
      'init'
    ];

    public init() {
      this.registerSailsHook('after', ['hook:redbox:storage:ready', 'hook:redbox:datastream:ready', 'ready'], () => {
        const datastreamServiceName = sails.config.record.datastreamService;
        sails.log.verbose(`PDFService Webservice ready, using datastream service: ${datastreamServiceName}`);
        if (datastreamServiceName != undefined) {
          this.DatastreamService = sails.services[datastreamServiceName] as unknown as DatastreamService;
        }
      });
      if (typeof sails.on === 'function') {
        sails.on('lower', () => this.shutdownPDFRetries());
      }
    }

    public async shutdownPDFRetries(): Promise<void> {
      const tasks = Array.from(this.retryTasks.values());
      await Promise.all(tasks.map(async (task) => {
        task.interruptReason = 'shutdown';
        if (task.fiber == null) {
          return;
        }
        try {
          await Effect.runPromise(Fiber.interrupt(task.fiber));
        } catch (error) {
          sails.log.warn('PDFService::Failed to interrupt PDF retry task during shutdown.', error);
        }
      }));
    }

    private cancelPendingRetry(currentURL: string): void {
      const task = this.retryTasks.get(currentURL);
      if (task == null) {
        return;
      }
      task.interruptReason = 'superseded';
      if (task.fiber != null) {
        Effect.runPromise(Fiber.interrupt(task.fiber)).catch((error) => {
          sails.log.warn('PDFService::Failed to interrupt superseded PDF retry task.', error);
        });
      }
    }

    private logWarn(message: string, ...args: Array<unknown>) {
      return Effect.sync(() => sails.log.warn(message, ...args)).pipe(Effect.zipRight(Effect.logWarning(message)));
    }

    private logError(message: string, ...args: Array<unknown>) {
      return Effect.sync(() => sails.log.error(message, ...args)).pipe(Effect.zipRight(Effect.logError(message)));
    }

    private logDebug(message: string, ...args: Array<unknown>) {
      return Effect.sync(() => sails.log.debug(message, ...args)).pipe(Effect.zipRight(Effect.logDebug(message)));
    }

    private isRetryable(error: PDFError): boolean {
      return error._tag === 'BrowserError'
        || error._tag === 'PDFRenderError'
        || error._tag === 'DatastreamSaveError';
    }

    protected launchBrowser(options: Parameters<typeof launch>[0]) {
      return launch(options);
    }

    private async waitForPageReady(page: any, brand: any, options: any, readinessStrategy: string): Promise<void> {
      const timeout = this.getOption(brand, options, 'readinessTimeout', 60000);

      switch (readinessStrategy) {
        case 'networkIdle':
          await page.waitForNetworkIdle({
            idleTime: this.getOption(brand, options, 'networkIdleTime', 2000),
            timeout
          });
          break;
        case 'selector':
          await page.waitForSelector(
            this.getOption(brand, options, 'waitForSelector'), { timeout }
          );
          break;
        case 'jsFlag':
          await page.waitForFunction(
            this.getOption(brand, options, 'waitForFunction'),
            { timeout, polling: 500 }
          );
          break;
        case 'networkIdle+selector':
          await page.waitForNetworkIdle({
            idleTime: this.getOption(brand, options, 'networkIdleTime', 2000),
            timeout
          });
          await page.waitForSelector(
            this.getOption(brand, options, 'waitForSelector'), { timeout }
          );
          break;
        default:
          sails.log.warn(`PDFService::Unknown readinessStrategy '${readinessStrategy}', falling back to networkIdle`);
          await page.waitForNetworkIdle({
            idleTime: this.getOption(brand, options, 'networkIdleTime', 2000),
            timeout
          });
          break;
      }
    }

    private attemptPDFGeneration(
      oid: string,
      record: any,
      options: any,
      brand: any,
      attempt: number,
      parentAuditCtx?: IntegrationAuditContext | null
    ): Effect.Effect<PDFGenerationResult, PDFError> {
      // Resolve URL / option metadata up-front so that the audit `requestSummary`
      // describes what we're about to attempt regardless of whether the browser
      // launch ever succeeds.
      const sourceUrlBase = this.getOption(brand, options, 'sourceUrlBase', `/${brand.name}/rdmp/record/view`);
      const pdfgenAppUrlOverride = this.getOption(brand, options, 'appUrlOverride');
      const baseUrl = pdfgenAppUrlOverride || sails.config.appUrl;
      const currentURL = `${baseUrl}${sourceUrlBase}/${oid}`;
      const readinessStrategy = this.getOption(brand, options, 'readinessStrategy', 'networkIdle');
      const pdfPrefix = this.getOption(brand, options, 'pdfPrefix', 'pdf');

      const work = Effect.scoped(Effect.gen(this, function* () {
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

        yield* Effect.sync(() => sails.log.verbose(`PDFService::Creating PDF for: ${oid} (Attempt ${attempt})`));

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
          (claimed) => claimed
            ? Effect.sync(() => {
                this.processMap.delete(currentURL);
              })
            : Effect.void
        );

        if (!claimedRequest) {
          yield* this.logWarn(`PDFService::PDF generation already in progress for ${currentURL}, skipping duplicate request.`);
          return {
            outcome: 'duplicateSuppressed' as const
          };
        }

        const tmpUserDataDir = yield* Effect.acquireRelease(
          Effect.tryPromise({
            try: () => fs.mkdtemp(path.join(os.tmpdir(), 'pdfgen')),
            catch: (cause) => new BrowserError(oid, '', cause)
          }),
          (dir) => Effect.promise(() => fs.rm(dir, { recursive: true, force: true })).pipe(Effect.catchAll(() => Effect.void))
        );

        const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH
          || ['/usr/bin/chromium', '/usr/bin/chromium-browser', '/usr/bin/google-chrome-stable'].find(candidate => existsSync(candidate));

        const browser = yield* Effect.acquireRelease(
          Effect.tryPromise({
            try: () => this.launchBrowser({
              headless: true,
              executablePath,
              args: ['--no-sandbox', `--user-data-dir=${tmpUserDataDir}`]
            }),
            catch: (cause) => new BrowserError(oid, '', cause)
          }),
          (instance) => Effect.promise(async () => {
            try {
              await instance.close();
            } catch {
              // ignore close failures, process kill below handles the hard stop
            }
            const proc = instance.process?.();
            if (proc) {
              proc.kill('SIGTERM');
            }
          }).pipe(Effect.catchAll(() => Effect.void))
        );

        const page = yield* Effect.acquireRelease(
          Effect.tryPromise({
            try: () => browser.newPage(),
            catch: (cause) => new BrowserError(oid, '', cause)
          }),
          (instance) => Effect.promise(() => instance.close()).pipe(Effect.catchAll(() => Effect.void))
        );

        yield* Effect.tryPromise({
          try: () => Promise.resolve(page.setExtraHTTPHeaders({
            Authorization: 'Bearer ' + token
          })),
          catch: (cause) => new BrowserError(oid, currentURL, cause)
        });

        const enableLogging = this.getOption(brand, options, 'enableChromeLogging');
        if (enableLogging === true || enableLogging === 'true') {
          yield* Effect.sync(() => {
            page.on('console', (msg: any) => {
              sails.log.verbose(`PDFService::Chrome Console:${msg.text()}`);
            });
            page.on('pageerror', (error: any) => {
              sails.log.error(`PDFService::Chrome Page Error: ${error.message}`);
            });
            page.on('response', (response: any) => {
              sails.log.verbose(`PDFService::Chrome Response: ${response.status()}, URL:${response.url()}`);
            });
            page.on('requestfailed', (request: any) => {
              sails.log.error(`PDFService::Chrome Error: ${request.failure()?.errorText}, URL: ${request.url()}`);
            });
          });
        }

        yield* Effect.sync(() => {
          sails.log.verbose(`PDFService::sourceUrlBase ${sourceUrlBase}`);
          sails.log.verbose(`PDFService::sails.config.pdfgen.appUrlOverride ${pdfgenAppUrlOverride}`);
        });

        yield* this.logDebug(`PDFService::Chromium loading page: ${currentURL}`);

        yield* Effect.tryPromise({
          try: () => page.goto(currentURL, { waitUntil: 'domcontentloaded' }),
          catch: (cause) => new BrowserError(oid, currentURL, cause)
        }).pipe(Effect.withSpan('navigatePage', { attributes: { oid, attempt, url: currentURL } }));

        yield* Effect.tryPromise({
          try: () => this.waitForPageReady(page, brand, options, readinessStrategy),
          catch: (cause) => new BrowserError(oid, currentURL, cause)
        }).pipe(Effect.withSpan('waitForPageReady', {
          attributes: {
            oid,
            attempt,
            strategy: readinessStrategy
          }
        }));

        yield* Effect.sync(() => sails.log.verbose(`PDFService::Page ready: ${currentURL}, generating PDF...`));

        const date = DateTime.now().toMillis();
        const fileId = `${pdfPrefix ? `${pdfPrefix}-` : ''}${oid}-${date}.pdf`;

        const rawPdfOptions = this.getOption(brand, options, 'PDFOptions') || {};
        const { path: _ignoredPath, ...pdfOptions } = rawPdfOptions;

        const defaultPDFOptions: any = {
          format: 'A4',
          printBackground: true,
          ...pdfOptions
        };

        const pdfBuffer = yield* Effect.tryPromise({
          try: () => page.pdf(defaultPDFOptions),
          catch: (cause) => new PDFRenderError(oid, cause)
        }).pipe(Effect.withSpan('renderPDFBuffer', { attributes: { oid, attempt } }));

        yield* this.logDebug(`PDFService::Generated PDF buffer`);
        yield* Effect.sync(() => sails.log.verbose(`PDFService::Saving PDF: ${oid}`));

        if (typeof StorageManagerService === 'undefined' || StorageManagerService == null) {
          return yield* Effect.fail(new DatastreamSaveError(oid, new Error('StorageManagerService global is not available')));
        }
        const stagingDisk = StorageManagerService.stagingDisk();
        yield* Effect.tryPromise({
          try: () => stagingDisk.put(fileId, pdfBuffer),
          catch: (cause) => new DatastreamSaveError(oid, cause)
        }).pipe(Effect.withSpan('saveToDatastream', { attributes: { oid, attempt, fileId } }));

        const datastream = new Datastream({ fileId: fileId, name: fileId });
        yield* Effect.tryPromise({
          try: () => this.DatastreamService.addDatastream(oid, datastream, stagingDisk),
          catch: (cause) => new DatastreamSaveError(oid, cause)
        }).pipe(
          Effect.catchAll((error) =>
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
          pdfBufferSize: (pdfBuffer as Buffer | Uint8Array | { length?: number })?.length ?? 0
        };
      })).pipe(Effect.withSpan('generatePDF', { attributes: { oid, attempt, brand: brand.name } }));

      // Audit lifecycle wrapper. `startPdfAudit` returns null when the global
      // `IntegrationAuditService` is absent, so the helpers no-op gracefully
      // and PDF generation behaviour is unchanged in non-audit environments.
      return Effect.suspend(() => {
        // Distinguish the initial attempt (treated as the original trigger) from
        // retry attempts. A parent context alone isn't enough — `createPDF` always
        // creates a parent and threads it into attempt 1 so the child links into
        // the trace. The retry signal is `attempt > 1`.
        const childTriggeredBy = attempt > 1 ? 'pdfRetry' : 'createPDF';
        const auditCtx = startPdfAudit(
          oid,
          PdfIntegrationAuditAction.generatePdf,
          {
            integrationName: PdfIntegrationAuditName,
            brandId: record?.metaMetadata?.brandId,
            triggeredBy: childTriggeredBy,
            requestSummary: {
              attempt,
              url: currentURL,
              sourceUrlBase,
              readinessStrategy,
              pdfPrefix
            }
          },
          parentAuditCtx
        );

        return Effect.matchEffect(work, {
          onSuccess: (result) =>
            Effect.sync(() => {
              if (result?.outcome === 'duplicateSuppressed') {
                completePdfAudit(auditCtx, {
                  message: 'PDF generation skipped because a duplicate request was already in progress.',
                  responseSummary: {
                    outcome: result.outcome,
                    attempt
                  }
                });
                return;
              }
              completePdfAudit(auditCtx, {
                message: 'PDF generated successfully.',
                responseSummary: {
                  outcome: result?.outcome,
                  fileId: result?.fileId,
                  pdfBufferSize: result?.pdfBufferSize,
                  attempt
                }
              });
            }).pipe(Effect.as(result)),
          onFailure: (error: PDFError) =>
            Effect.sync(() => {
              failPdfAudit(auditCtx, error, {
                message: 'PDF generation failed.',
                responseSummary: {
                  errorTag: error._tag,
                  url: currentURL,
                  cause: (error as { cause?: unknown }).cause instanceof Error
                    ? ((error as { cause?: Error }).cause as Error).message
                    : undefined,
                  attempt
                }
              });
            }).pipe(Effect.zipRight(Effect.fail(error)))
        });
      });
    }

    private getBrandingEffect(record: any): Effect.Effect<any, MissingBrandError> {
      return Effect.gen(this, function* () {
        if (typeof BrandingService === 'undefined') {
          return yield* Effect.die(new Error('BrandingService global is not available'));
        }
        const brandId = record?.metaMetadata?.brandId;
        const brand = BrandingService.getBrandById(brandId);
        if (brand == null) {
          return yield* Effect.fail(new MissingBrandError(record?.oid, brandId));
        }
        return brand;
      });
    }

    private getOption(branding: any, option: any, key: keyof PdfgenConfig | string, defaultValue: any = undefined) {
      const brandingConfig = sails.config.brandingAware(branding.name) as unknown as Record<string, unknown> & {
        pdfgen?: Record<string, unknown>;
      };
      let value = brandingConfig.pdfgen?.[key];
      if (option && option[key] !== undefined) {
        value = option[key];
      }
      if (value === undefined) {
        return defaultValue;
      }
      return value;
    }


    public createPDF(oid: string, record: any, options: any, user: any) {
      const effect = Effect.gen(this, function* () {
        const brand = yield* this.getBrandingEffect({ ...record, oid });
        const maxRetries = this.getOption(brand, options, 'maxRetries', 2);
        const baseDelayMs = this.getOption(brand, options, 'retryDelayMs', 5000);
        const multiplier = this.getOption(brand, options, 'retryBackoffMultiplier', 2);
        const sourceUrlBase = this.getOption(brand, options, 'sourceUrlBase', `/${brand.name}/rdmp/record/view`);
        const pdfgenAppUrlOverride = this.getOption(brand, options, 'appUrlOverride');
        const baseUrl = pdfgenAppUrlOverride || sails.config.appUrl;
        const currentURL = `${baseUrl}${sourceUrlBase}/${oid}`;
        const triggerSource = (options && typeof options === 'object' && typeof options.triggerSource === 'string')
          ? options.triggerSource
          : 'createPDF';

        // Parent audit span — links every attempt under one trace so a single
        // createPDF lifecycle (initial attempt + any background retries) is
        // visible as one trace in the audit dashboard. Returns null when the
        // global IntegrationAuditService is absent.
        const parentAuditCtx = startPdfAudit(
          oid,
          PdfIntegrationAuditAction.generatePdfTrigger,
          {
            integrationName: PdfIntegrationAuditName,
            brandId: record?.metaMetadata?.brandId,
            triggeredBy: triggerSource,
            requestSummary: {
              maxRetries,
              baseDelayMs,
              multiplier,
              triggerSource
            }
          }
        );

        let attemptsRun = 0;
        let parentClosed = false;
        const closeParent = (finalStatus: 'success' | 'failed' | 'skipped' | 'pending', error?: unknown) => {
          if (parentClosed) {
            return;
          }
          parentClosed = true;
          if (finalStatus === 'failed' && error != null) {
            failPdfAudit(parentAuditCtx, error, {
              message: 'PDF generation pipeline failed.',
              responseSummary: { attemptsRun, finalStatus }
            });
            return;
          }
          completePdfAudit(parentAuditCtx, {
            message: finalStatus === 'skipped'
              ? 'PDF generation pipeline skipped.'
              : 'PDF generation pipeline completed.',
            responseSummary: {
              attemptsRun,
              finalStatus,
              ...(error instanceof MissingTokenError ? { errorTag: error._tag } : {})
            }
          });
        };

        const runBackgroundRetries = (retryToken: symbol, remainingRetries: number, nextAttempt: number): Effect.Effect<void, never> =>
          Effect.gen(this, function* () {
              const retryTask = this.retryTasks.get(currentURL);
              if (retryTask?.token !== retryToken) {
                closeParent('skipped');
                return;
              }
              const retryIndex = maxRetries - remainingRetries;
              const delayMs = baseDelayMs * Math.pow(multiplier, retryIndex);
              yield* this.logWarn(`PDFService::Scheduling retry ${nextAttempt - 1} of ${maxRetries} for ${oid} in ${delayMs}ms`);
              yield* Effect.sleep(Duration.millis(delayMs));
              if (this.retryTasks.get(currentURL)?.token !== retryToken) {
                closeParent('skipped');
                return;
              }
              attemptsRun += 1;
              yield* this.attemptPDFGeneration(oid, record, options, brand, nextAttempt, parentAuditCtx).pipe(
                Effect.matchEffect({
                  onSuccess: () => Effect.sync(() => closeParent('success')),
                  onFailure: (error: PDFError) => {
                    if (this.isRetryable(error)) {
                      if (remainingRetries === 1) {
                        return this.logError(`PDFService::Max retries exhausted for ${oid} or non-retryable error.`, error)
                          .pipe(Effect.zipRight(Effect.sync(() => closeParent('failed', error))));
                      }
                      return runBackgroundRetries(retryToken, remainingRetries - 1, nextAttempt + 1);
                    }
                    return this.logWarn(`PDFService::non-retryable failure, skipping`, error)
                      .pipe(Effect.zipRight(Effect.sync(() => closeParent('failed', error))));
                  }
                })
              );
            });

        attemptsRun += 1;
        return yield* this.attemptPDFGeneration(oid, record, options, brand, 1, parentAuditCtx).pipe(
          Effect.matchEffect({
            onSuccess: () => Effect.sync(() => {
              this.cancelPendingRetry(currentURL);
              closeParent('success');
            }),
            onFailure: (error: PDFError) => {
              if (this.isRetryable(error)) {
                if (maxRetries <= 0) {
                  return Effect.sync(() => {
                    sails.log.error(`PDFService::Max retries exhausted for ${oid}, no remaining retries.`, error);
                    closeParent('failed', error);
                  });
                }
                return Effect.gen(this, function* () {
                  yield* this.logWarn(`PDFService::Best-effort generation failed for ${oid}, but not blocking workflow. Retry scheduled: true. Error: ${error?.name} - ${error?.message}`);
                  const retryToken = Symbol(currentURL);
                  this.retryTasks.set(currentURL, { token: retryToken });
                  const retryEffect = runBackgroundRetries(retryToken, maxRetries, 2).pipe(
                    Effect.onInterrupt(() => Effect.sync(() => {
                      const task = this.retryTasks.get(currentURL);
                      if (task?.token !== retryToken) {
                        return;
                      }
                      if (task.interruptReason === 'shutdown') {
                        closeParent('failed', new Error('PDF retry interrupted during service shutdown'));
                        return;
                      }
                      closeParent('skipped');
                    })),
                    Effect.ensuring(Effect.sync(() => {
                      const task = this.retryTasks.get(currentURL);
                      if (task?.token === retryToken) {
                        this.retryTasks.delete(currentURL);
                      }
                    }))
                  );
                  const fiber = yield* Effect.forkDaemon(retryEffect);
                  const retryTask = this.retryTasks.get(currentURL);
                  if (retryTask?.token === retryToken) {
                    retryTask.fiber = fiber;
                  } else {
                    yield* Fiber.interrupt(fiber).pipe(Effect.asVoid);
                  }
                });
              }

              if (error._tag === 'MissingTokenError') {
                return this.logWarn(`PDFService::Best-effort generation failed for ${oid}, but not blocking workflow. Retry scheduled: false. Error: ${error?.name} - ${error?.message}`)
                  .pipe(Effect.zipRight(Effect.sync(() => closeParent('skipped', error))));
              }

              return this.logWarn(`PDFService::Best-effort generation failed for ${oid}, but not blocking workflow. Retry scheduled: false. Error: ${error?.name} - ${error?.message}`)
                .pipe(Effect.zipRight(Effect.sync(() => closeParent('failed', error))));
            }
          }),
          Effect.as(record),
          Effect.withSpan('createPDF', { attributes: { oid, brand: brand.name } })
        );
      });

      const pdfPromise = Effect.runPromiseExit(effect).then((exit) => {
        if (exit._tag === 'Success') {
          return exit.value;
        }
        throw Cause.squash(exit.cause);
      });

      return from(pdfPromise);
    }
  }
}
