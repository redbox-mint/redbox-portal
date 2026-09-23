import { installExternalAssetStubs } from './stubs';
import type { Browser, BrowserContext, Page } from '@playwright/test';

export type Persona = { username: string; password: string };
export const adminPersona: Persona = {
  username: process.env.PLAYWRIGHT_ADMIN_USER ?? 'admin',
  password: process.env.PLAYWRIGHT_ADMIN_PASSWORD ?? 'rbadmin',
};
export const ordinaryPersona: Persona = {
  username: process.env.PLAYWRIGHT_USER ?? 'playwright-user',
  password: process.env.PLAYWRIGHT_USER_PASSWORD ?? 'playwright-user-password',
};

export async function csrfToken(context: BrowserContext): Promise<string> {
  const configuredRoot = process.env.PLAYWRIGHT_ROOT_CONTEXT?.trim().replace(/\/$/, '');
  const paths = Array.from(
    new Set([
      configuredRoot ? `${configuredRoot}/csrfToken` : '',
      '/csrfToken',
      '/default/csrfToken',
      '/default/rdmp/csrfToken',
    ])
  ).filter(Boolean);
  const statuses: string[] = [];
  for (const path of paths) {
    const response = await context.request.get(path);
    statuses.push(`${path}=${response.status()}`);
    if (response.ok()) {
      const body = (await response.json().catch(() => ({}))) as { _csrf?: string; csrfToken?: string };
      if (body._csrf ?? body.csrfToken) return body._csrf ?? body.csrfToken!;
    }
  }
  throw new Error(`The portal did not return a CSRF token from its root-context endpoint (${statuses.join(', ')}).`);
}

export async function loginWithCsrf(page: Page, persona: Persona = adminPersona): Promise<string> {
  const context = page.context();
  const token = await csrfToken(context);
  const response = await context.request.post('/user/login_local', {
    form: { username: persona.username, password: persona.password, _csrf: token },
    headers: { 'X-CSRF-Token': token, 'x-source': 'jsclient' },
  });
  if (!response.ok()) throw new Error(`Login failed (${response.status()} ${response.statusText()}).`);
  const result = (await response.json()) as { user?: { username?: string }; message?: string };
  if (result.user?.username !== persona.username)
    throw new Error(`Login did not establish '${persona.username}': ${result.message ?? 'unknown response'}`);
  return await csrfToken(context);
}

export async function assertAuthenticated(page: Page): Promise<void> {
  await page.goto('/default/rdmp/admin', { waitUntil: 'domcontentloaded' });
  await page.locator('.admin-main-content').waitFor({ state: 'visible' });
}

export async function createAuthenticatedContext(
  browser: Browser,
  persona: Persona = adminPersona
): Promise<{ context: BrowserContext; page: Page; csrfToken: string }> {
  const context = await browser.newContext({
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://127.0.0.1:1500',
    locale: 'en-AU',
    timezoneId: 'Australia/Brisbane',
  });
  try {
    await installExternalAssetStubs(context);
    const page = await context.newPage();
    const csrfToken = await loginWithCsrf(page, persona);
    return { context, page, csrfToken };
  } catch (error) {
    await context.close();
    throw error;
  }
}
