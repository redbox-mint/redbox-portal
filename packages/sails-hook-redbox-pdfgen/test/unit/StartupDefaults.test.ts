import assert from 'node:assert/strict';
import * as sinon from 'sinon';
import { loadPortalConfiguration } from '@researchdatabox/redbox-core/configuration';
import { pdfgen } from '../../src/config/pdfgen';

const load = (config: Record<string, unknown>) =>
  loadPortalConfiguration({
    env: { REDBOX_SESSION_SECRET: 'validation-defaults-disposable-session-secret' },
    extensions: { providers: [{ name: 'institution', root: '.', declaration: { apiVersion: 1, config } }] },
  });
const json = <T>(value: T): T => JSON.parse(JSON.stringify(value));

// The hook owns these consumer checks because it installs Puppeteer and Effect.
describe('PDF startup configuration consumed by the service', () => {
  it('accepts an empty PDF filename prefix through the actual PDF service', async () => {
    const config = await load({ pdfgen: { ...pdfgen, pdfPrefix: '' } });
    const { Services } = require('../../dist/api/services/PDF');
    const { Effect } = require('effect');
    const { pdfDependencies, navigationResponse } = require('../support/pdfFixture');
    const input = pdfDependencies({ optionsForBrand: () => ({ ...config.pdfgen, token: 'fixture-token' }) });
    const service = new Services.PDF(input);
    const page = {
      setRequestInterception: async () => {},
      emulateMediaType: async () => {},
      on() {},
      mainFrame: () => ({}),
      goto: async (url: string) => {
        page.url = () => url;
        return navigationResponse(url);
      },
      url: () => '',
      waitForNetworkIdle: async () => {},
      pdf: async () => Buffer.from('pdf'),
      close: async () => {},
    };
    const browser = { newPage: async () => page, close: async () => {}, process: () => null };
    sinon.stub(service, 'launchBrowser').resolves(browser);
    try {
      await service.initialize();
      await service.activate();
      await Effect.runPromise(
        service.attemptPDFGeneration('oid-prefixless', { metaMetadata: { brandId: 1 } }, {}, { name: 'default' }, 1)
      );
      assert.match(input.stagingDisk().put.firstCall.args[0], /^oid-prefixless-[0-9]+\.pdf$/);
    } finally {
      await service.close();
      sinon.restore();
    }
    await assert.rejects(load({ pdfgen: { ...pdfgen, pdfPrefix: false } }), /pdfPrefix/);
  });

  it('accepts native Puppeteer paper names and numeric pixel dimensions without coercion', async () => {
    const { parsePDFOptions } = await import('../../node_modules/puppeteer-core/lib/puppeteer/common/util.js');
    for (const options of [
      { format: 'a4' },
      { format: 'LETTER' },
      { format: 'legal' },
      { width: 960, height: 480, margin: { top: 96, right: 0, bottom: '1cm', left: '1in' } },
    ]) {
      const config = await load({ pdfgen: { ...pdfgen, PDFOptions: options } });
      assert(config.pdfgen);
      assert.deepEqual(config.pdfgen.PDFOptions, options);
      const parsed = parsePDFOptions(json(config.pdfgen.PDFOptions) as Parameters<typeof parsePDFOptions>[0]);
      if ('width' in options) {
        assert.equal(parsed.width, 10);
        assert.equal(parsed.height, 5);
        assert.equal(parsed.margin.top, 1);
      } else assert(parsed.width > 0 && parsed.height > 0);
    }
    const zeroTimeout = await load({ pdfgen: { ...pdfgen, readinessTimeout: 0 } });
    const { Services } = require('../../dist/api/services/PDF');
    const { pdfDependencies } = require('../support/pdfFixture');
    const service = new Services.PDF(pdfDependencies({ optionsForBrand: () => zeroTimeout.pdfgen }));
    let readinessOptions: { timeout: number } | undefined;
    await Reflect.get(service, 'waitForPageReady').call(
      service,
      {
        waitForNetworkIdle: async (options: { timeout: number }) => {
          readinessOptions = options;
        },
      },
      { name: 'default' },
      {},
      'networkIdle'
    );
    assert(readinessOptions);
    assert.equal(readinessOptions.timeout, 0);
    await assert.rejects(load({ pdfgen: { ...pdfgen, readinessTimeout: -1 } }), /readinessTimeout/);
    for (const PDFOptions of [{ format: 'not-paper' }, { width: {} }, { margin: { top: false } }])
      await assert.rejects(load({ pdfgen: { ...pdfgen, PDFOptions } }), /PDFOptions/);
  });
});
