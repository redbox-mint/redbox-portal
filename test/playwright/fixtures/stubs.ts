import type { APIRequestContext, BrowserContext } from '@playwright/test';

export type StubResponse = { status?: number; body?: unknown; hold?: boolean; headers?: Record<string, string> };

export class PlaywrightStubs {
  private readonly baseUrl: string;
  constructor(
    private readonly request: APIRequestContext,
    baseUrl = process.env.PLAYWRIGHT_STUB_URL ?? 'http://playwright-stubs:8787'
  ) {
    this.baseUrl = baseUrl;
  }

  async reset(): Promise<void> {
    const response = await this.request.post(`${this.baseUrl}/control/reset`);
    if (!response.ok()) throw new Error(`Stub reset failed (${response.status()}).`);
  }
  async responses(responses: Record<string, StubResponse>): Promise<void> {
    const response = await this.request.post(`${this.baseUrl}/control/responses`, { data: { responses } });
    if (!response.ok()) throw new Error(`Stub configuration failed (${response.status()}).`);
  }
  async requests(): Promise<Array<Record<string, unknown>>> {
    const response = await this.request.get(`${this.baseUrl}/control/requests`);
    if (!response.ok()) throw new Error(`Stub request log failed (${response.status()}).`);
    return (await response.json()) as Array<Record<string, unknown>>;
  }

  async release(id: string): Promise<void> {
    const response = await this.request.post(`${this.baseUrl}/control/release`, { data: { id } });
    if (!response.ok()) throw new Error(`Stub release failed (${response.status()}).`);
  }
}

// External font stylesheets are the only fixed browser resource URLs outside
// the portal. Their HTTP responses come from the local fixture service.
export const fontStylesheetUrls = new Set([
  'https://fonts.googleapis.com/css?family=Titillium+Web:400,200,300,700,600&display=swap',
  'https://fonts.googleapis.com/css?family=Roboto+Condensed:400,700,300&display=swap',
  'https://fonts.googleapis.com/css?family=Raleway:400,100&display=swap',
  'https://fonts.googleapis.com/css?family=Open+Sans:400italic,600',
]);

export async function installExternalAssetStubs(context: BrowserContext): Promise<void> {
  await context.route(url => fontStylesheetUrls.has(url.href), async route => {
    const base = process.env.PLAYWRIGHT_STUB_URL ?? 'http://playwright-stubs:8787';
    const response = await context.request.get(`${base}/fonts/css`, { params: { family: new URL(route.request().url()).searchParams.get('family')! } });
    if (!response.ok()) throw new Error(`Local font stylesheet failed (${response.status()}).`);
    await route.fulfill({ response });
  });
}
