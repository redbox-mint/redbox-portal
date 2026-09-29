let expect: Chai.ExpectStatic;
import('chai').then(mod => (expect = mod.expect));
import fs from 'node:fs';
import path from 'node:path';
import { setupServiceTestGlobals, cleanupServiceTestGlobals } from '../services/testHelper';

// Explicit browser suite: run separately from datastore/service tests.
const { chromium } = require('@playwright/test');
const sass = require('sass');
const root = path.resolve(__dirname, '../../../..');

describe('Branding browser print and native upload controls', function () {
  this.timeout(20000);
  let browser: import('@playwright/test').Browser;
  before(async function () {
    setupServiceTestGlobals();
    browser = await chromium.launch({ executablePath: process.env.CHROME_BIN, headless: true, args: ['--no-sandbox'] });
  });
  after(async function () {
    await browser?.close();
    cleanupServiceTestGlobals();
  });

  it('applies generated custom typography through the real print cascade and preserves inactive defaults', async function () {
    const { Services } = require('../../src/services/BrandingThemeCssService');
    const theme = new Services.BrandingThemeCss();
    const bridge = sass.compileString(
      fs.readFileSync(path.join(root, 'assets/styles/default-variables.scss'), 'utf8') +
        '\n' +
        fs.readFileSync(path.join(root, 'assets/styles/print.scss'), 'utf8')
    ).css;
    const print = fs.readFileSync(path.join(root, 'assets/styles/print.css'), 'utf8');
    const page = await browser.newPage();
    await page.emulateMedia({ media: 'print' });
    await page.route('http://branding.test/**', route =>
      route.fulfill({
        contentType: 'font/woff2',
        body: fs.readFileSync(path.join(root, 'test/resources/fonts/test-font-regular.woff2')),
      })
    );
    try {
      for (const custom of [false, true]) {
        const typeface = custom
          ? { mode: 'custom', faces: { regular: { slot: 'regular', sha256: 'a'.repeat(64) } } }
          : null;
        const css = theme.generate({}, { typeface, brandName: 'default' }).css;
        await page.setContent(
          `<base href="http://branding.test/default/portal/"><style>${bridge}</style><style>${css}</style><style>${print}</style><h1>Heading</h1><p>Body</p><table><tr><td>Cell</td></tr></table>`
        );
        expect(await page.evaluate(() => matchMedia('print').matches)).to.equal(true);
        if (custom) {
          expect(
            await page.evaluate(async () => {
              const fonts = await document.fonts.load('16px "ReDBox Brand Typeface"');
              return fonts.length > 0 && fonts.every(font => font.status === 'loaded');
            })
          ).to.equal(true);
        }
        const families = await page
          .locator('body,h1,p,td')
          .evaluateAll(elements => elements.map(element => getComputedStyle(element).fontFamily));
        for (const family of families) {
          expect(family).to.contain(custom ? 'ReDBox Brand Typeface' : 'Titillium Web');
          if (!custom) expect(family).not.to.contain('ReDBox Brand Typeface');
        }
      }
    } finally {
      await page.close();
    }
  });

  it('allows Tab then Enter to open each native upload/replace picker from the actual template', async function () {
    // The Angular suite checks rendered bindings and disabled state. Here the
    // browser exercises trusted keyboard defaults on the exact native markup.
    const template = fs.readFileSync(
      path.join(root, 'angular/projects/researchdatabox/branding/src/app/branding-admin.component.html'),
      'utf8'
    );
    const bootstrap = fs.readFileSync(
      path.join(root, 'angular/node_modules/bootstrap/dist/css/bootstrap.min.css'),
      'utf8'
    );
    const page = await browser.newPage();
    try {
      await page.setContent(`<style>${bootstrap}</style>${template}`);
      const controls = page.locator('input[accept=".woff2,font/woff2"]');
      expect(await controls.count()).to.equal(2);
      for (let index = 0; index < 2; index++) {
        const control = controls.nth(index);
        await control.evaluate(element => {
          const previous = document.createElement('button');
          previous.textContent = 'Before picker';
          element.before(previous);
          previous.focus();
        });
        await page.keyboard.press('Tab');
        expect(await control.evaluate(element => element === document.activeElement)).to.equal(true);
        const picker = page.waitForEvent('filechooser');
        await page.keyboard.press('Enter');
        await (await picker).setFiles([]);
      }
    } finally {
      await page.close();
    }
  });
});
