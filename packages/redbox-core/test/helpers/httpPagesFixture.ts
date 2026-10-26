import type { Router, RequestHandler } from 'express';
import { httpRouteFixture } from './httpRouteFixture';
import { pageInputFixture } from './pageInputFixture';
import { mountPageRoutes, type PagesHttpInput } from '../../src/http/express/pages';

/** Actual EJS pages and HTTP admission, with explicit suite-local page ports. */
export async function httpPagesFixture(
  configure: (pages: PagesHttpInput & { csrf: { apiProtect: RequestHandler } }, router: Router) => void = () => {}
) {
  const page = await pageInputFixture();
  await page.input.artifacts.initialize();
  try {
    const f = await httpRouteFixture((router, input) => {
      router.use((req, _res, next) => {
        req.session = {} as typeof req.session;
        next();
      });
      const pages = { ...page.input, ...input, csrf: { ...page.input.csrf, ...input.csrf } };
      configure(pages, router);
      mountPageRoutes(router, pages);
    });
    return {
      ...f,
      page,
      async close() {
        try {
          await f.close();
        } finally {
          await page.input.artifacts.close();
        }
      },
    };
  } catch (error) {
    await page.input.artifacts.close();
    throw error;
  }
}
