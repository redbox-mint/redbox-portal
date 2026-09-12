import type { APIResponse, Page, Route } from '@playwright/test';

export type ResponseGateOptions = {
  url: string | RegExp;
  method?: string;
  occurrence?: number;
  timeoutMs?: number;
};

function matches(value: string, expected: string | RegExp): boolean {
  if (typeof expected === 'string') return value.includes(expected);
  expected.lastIndex = 0;
  const matched = expected.test(value);
  expected.lastIndex = 0;
  return matched;
}

/** Holds one real response and fulfils it unchanged after release. The gate
 * is useful for proving that an async bootstrap update is passive: tests can
 * release the response and immediately assert the rendered result. */
export class ResponseGate {
  private readonly capturedPromise: Promise<APIResponse>;
  private resolveCaptured!: (response: APIResponse) => void;
  private rejectCaptured!: (error: Error) => void;
  private readonly releasePromise: Promise<void>;
  private resolveRelease!: () => void;
  private seen = 0;
  private extraMatches = 0;
  private disposed = false;
  private failure?: Error;
  private readonly completed: Promise<void>;
  private resolveCompleted!: () => void;
  private readonly handler: (route: Route) => Promise<void>;

  constructor(
    private readonly page: Page,
    private readonly options: ResponseGateOptions
  ) {
    this.capturedPromise = new Promise<APIResponse>((resolve, reject) => {
      this.resolveCaptured = resolve;
      this.rejectCaptured = reject;
    });
    this.releasePromise = new Promise<void>(resolve => {
      this.resolveRelease = resolve;
    });
    this.completed = new Promise<void>(resolve => { this.resolveCompleted = resolve; });
    // dispose also reports capture errors, including when navigation failed before waitForCapture.
    void this.capturedPromise.catch(() => undefined);
    this.handler = async (route: Route): Promise<void> => {
      const request = route.request();
      if (
        this.disposed ||
        request.method() !== (this.options.method ?? 'GET').toUpperCase() ||
        !matches(request.url(), this.options.url)
      ) {
        await route.fallback();
        return;
      }
      this.seen += 1;
      if (this.seen !== (this.options.occurrence ?? 1)) {
        if (this.seen > (this.options.occurrence ?? 1)) this.extraMatches += 1;
        await route.fallback();
        return;
      }
      try {
        const response = await route.fetch({ maxRedirects: 0, timeout: this.options.timeoutMs ?? 30_000 });
        this.resolveCaptured(response);
        await this.releasePromise;
        await route.fulfill({ response });
      } catch (error) {
        this.failure = error instanceof Error ? error : new Error(String(error));
        this.rejectCaptured(this.failure);
        await route.abort().catch(() => undefined);
      } finally {
        this.resolveCompleted();
      }
    };
  }

  async install(): Promise<void> {
    await this.page.route('**/*', this.handler);
  }

  async waitForCapture(timeoutMs = this.options.timeoutMs ?? 30_000): Promise<APIResponse> {
    let timer: ReturnType<typeof setTimeout> | undefined;
    try {
      return await Promise.race([
        this.capturedPromise,
        new Promise<APIResponse>((_, reject) => {
          timer = setTimeout(
            () => reject(new Error(`Timed out waiting for ${String(this.options.url)} response capture.`)),
            timeoutMs
          );
        }),
      ]);
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  async release(): Promise<void> {
    this.resolveRelease();
    if (this.seen >= (this.options.occurrence ?? 1)) await this.completed;
    if (this.failure) throw this.failure;
  }

  async dispose(): Promise<void> {
    this.disposed = true;
    try {
      await this.release();
    } finally {
      await this.page.unroute('**/*', this.handler);
    }
    const expectedOccurrence = this.options.occurrence ?? 1;
    if (this.seen < expectedOccurrence) {
      throw new Error(
        `Response gate for ${String(this.options.url)} matched ${this.seen} requests; expected occurrence ${expectedOccurrence}.`
      );
    }
    if (this.extraMatches) {
      throw new Error(
        `Response gate for ${String(this.options.url)} matched ${this.seen} requests; expected occurrence ${expectedOccurrence}.`
      );
    }
  }
}
