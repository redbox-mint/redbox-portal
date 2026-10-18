import type { Page } from '@playwright/test';

// Library signatures survive hashing/minification and also cover shared chunks.
// Inspect responses instead of relying on development-only chunk names.
const signatures = {
  richText: 'ProseMirror-trailingBreak',
  upload: 'uppy-Dashboard-inner',
  dropbox: 'pluginNameDropbox',
  googleDrive: 'pluginNameGoogleDrive',
  onedrive: 'pluginNameOneDrive',
};
export type DeferredLibrary = keyof typeof signatures;

export async function trackFormScripts(
  page: Page,
  beforeResponse?: (library: DeferredLibrary, url: string) => Promise<'abort' | void>,
) {
  const loaded = new Set<DeferredLibrary>();
  await page.route(url => url.pathname.includes('/angular/form/') && url.pathname.endsWith('.js'), async route => {
    const response = await route.fetch();
    const source = await response.text();
    for (const [library, signature] of Object.entries(signatures)) {
      if (source.includes(signature)) {
        loaded.add(library as DeferredLibrary);
        if (await beforeResponse?.(library as DeferredLibrary, route.request().url()) === 'abort') {
          await route.abort('failed');
          return;
        }
      }
    }
    await route.fulfill({ response });
  });
  return loaded;
}
