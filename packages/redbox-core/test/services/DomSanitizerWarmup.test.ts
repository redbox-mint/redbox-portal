import Module = require('module');
import domPurify = require('dompurify');
import * as sinon from 'sinon';
import { createSinonStubLogger } from '../logger.test';
import { cleanupServiceTestGlobals, createMockSails, setupServiceTestGlobals } from './testHelper';

let expect: Chai.ExpectStatic;

type SanitizerModule = typeof import('../../src/services/DomSanitizerService');
type ModuleLoader = (request: string, parent: unknown, isMain: boolean) => unknown;
type ModuleWithLoader = { _load: ModuleLoader };

const servicePath = require.resolve('../../src/services/DomSanitizerService');
const windowCacheKey = '__domSanitizerWindow';
const cacheKey = (version: string) => Symbol.for(`@researchdatabox/redbox-core/domSanitizerWarmUp/${version}`);
const sanitizerCacheKey = cacheKey(domPurify.version);
const otherVersion = 'warmup-test-other-version';
const otherDomPurify = Object.assign(
  (...args: Parameters<typeof domPurify>) => domPurify(...args),
  { version: otherVersion }
);
const globalCache = globalThis as Record<PropertyKey, unknown>;

describe('DomSanitizerService warm-up', function () {
  let mockSails: ReturnType<typeof createMockSails>;
  let jsdomLoads: number;
  let failJsdomLoads: number;
  let useOtherVersion: boolean;
  let loadSpy: sinon.SinonStub;
  let savedModule: NodeModule | undefined;
  let savedWindow: unknown;
  let savedWindowCache: unknown;
  let savedSanitizerCache: unknown;
  let savedDomPurify: PropertyDescriptor | undefined;

  const loadFreshModule = (): SanitizerModule => {
    delete require.cache[servicePath];
    return require('../../src/services/DomSanitizerService') as SanitizerModule;
  };

  before(async function () {
    ({ expect } = await import('chai'));
  });

  beforeEach(function () {
    savedModule = require.cache[servicePath];
    savedWindow = globalCache.window;
    savedWindowCache = globalCache[windowCacheKey];
    savedSanitizerCache = globalCache[sanitizerCacheKey];
    savedDomPurify = Object.getOwnPropertyDescriptor(globalThis, 'DOMPurify');
    delete globalCache.window;
    delete globalCache[windowCacheKey];
    delete globalCache[sanitizerCacheKey];
    jsdomLoads = 0;
    failJsdomLoads = 0;
    useOtherVersion = false;
    mockSails = createMockSails({
      config: {
        appPath: '/app',
        dompurify: {
          defaultProfile: 'html',
          globalSettings: {},
          profiles: { html: { USE_PROFILES: { html: true } }, minimal: { ALLOWED_TAGS: ['b'] } },
        },
      },
      log: createSinonStubLogger(sinon),
    });
    setupServiceTestGlobals(mockSails);

    const moduleWithLoader = Module as typeof Module & ModuleWithLoader;
    const originalLoad = moduleWithLoader._load;
    loadSpy = sinon.stub(moduleWithLoader, '_load').callsFake((request, parent, isMain) => {
      if (request === 'dompurify' && useOtherVersion) return otherDomPurify;
      if (request === 'jsdom') {
        jsdomLoads += 1;
        if (failJsdomLoads > 0) {
          failJsdomLoads -= 1;
          throw new Error('simulated jsdom load failure');
        }
      }
      return originalLoad.call(Module, request, parent, isMain);
    });
  });

  afterEach(function () {
    sinon.restore();
    cleanupServiceTestGlobals();
    delete require.cache[servicePath];
    delete globalCache[windowCacheKey];
    delete globalCache[sanitizerCacheKey];
    delete globalCache[cacheKey(otherVersion)];
    delete globalCache.DOMPurify;
    if (savedModule) require.cache[servicePath] = savedModule;
    if (savedWindowCache !== undefined) globalCache[windowCacheKey] = savedWindowCache;
    if (savedSanitizerCache !== undefined) globalCache[sanitizerCacheKey] = savedSanitizerCache;
    if (savedDomPurify) Object.defineProperty(globalThis, 'DOMPurify', savedDomPurify);
    if (savedWindow !== undefined) globalCache.window = savedWindow;
  });

  it('does not load JSDOM when the module is only imported', function () {
    const sanitizer = loadFreshModule();

    expect(sanitizer.getSanitizerState()).to.equal('cold');
    expect(jsdomLoads).to.equal(0);
    expect(loadSpy.calledWith('jsdom')).to.equal(false);
  });

  it('reports cold then warm and warms once, idempotently', function () {
    const sanitizer = loadFreshModule();

    expect(sanitizer.warmSanitizer()).to.equal('warm');
    expect(sanitizer.getSanitizerState()).to.equal('warm');
    expect(jsdomLoads).to.equal(1);

    expect(sanitizer.warmSanitizer()).to.equal('warm');
    expect(sanitizer.warmSanitizer()).to.equal('warm');
    expect(jsdomLoads).to.equal(1);

    const verbose = mockSails.log.verbose as sinon.SinonStub;
    expect(verbose.callCount).to.equal(1);
    expect(String(verbose.firstCall.args[0])).to.match(/warmed in \d+(\.\d+)?ms/);
    expect((mockSails.log.warn as sinon.SinonStub).called).to.equal(false);
  });

  it('keeps warm-state reads side-effect free', function () {
    const sanitizer = loadFreshModule();

    sanitizer.getSanitizerState();
    sanitizer.getSanitizerState();

    expect(jsdomLoads).to.equal(0);
    expect((mockSails.log.verbose as sinon.SinonStub).called).to.equal(false);
  });

  it('shares warm-up state and keeps purifier instances local to each module copy', function () {
    const first = loadFreshModule();
    expect(first.warmSanitizer()).to.equal('warm');
    const purifier = globalCache.DOMPurify;
    const second = loadFreshModule();

    expect(first).not.to.equal(second);
    expect(second.getSanitizerState()).to.equal('warm');
    expect(second.warmSanitizer()).to.equal('warm');
    expect(globalCache.DOMPurify).not.to.equal(purifier);
    expect(jsdomLoads).to.equal(1);
    expect((mockSails.log.verbose as sinon.SinonStub).calledOnce).to.equal(true);
  });

  it('keeps a separate purifier for another installed DOMPurify version', function () {
    const first = loadFreshModule();
    expect(first.warmSanitizer()).to.equal('warm');
    const purifier = globalCache.DOMPurify;

    useOtherVersion = true;
    const other = loadFreshModule();
    expect(other.getSanitizerState()).to.equal('cold');
    expect(other.warmSanitizer()).to.equal('warm');
    expect(globalCache.DOMPurify).not.to.equal(purifier);
    expect(first.getSanitizerState()).to.equal('warm');
  });

  it('warns on warm-up failure, stays cold, and recovers through lazy initialisation', function () {
    const sanitizer = loadFreshModule();
    failJsdomLoads = 1;

    expect(sanitizer.warmSanitizer()).to.equal('cold');
    expect(sanitizer.getSanitizerState()).to.equal('cold');
    expect(sanitizer.warmSanitizer()).to.equal('cold');
    expect(jsdomLoads).to.equal(1);
    expect((mockSails.log.warn as sinon.SinonStub).calledOnce).to.equal(true);
    expect((mockSails.log.verbose as sinon.SinonStub).called).to.equal(false);

    const service = new sanitizer.Services.DomSanitizer();
    expect(service.sanitizeWithProfile('<b>ok</b><script>x</script>', 'minimal')).to.equal('<b>ok</b>');

    expect(sanitizer.getSanitizerState()).to.equal('warm');
    expect(jsdomLoads).to.equal(2);
  });

  it('keeps startup available when the warm-up logger throws', function () {
    const sanitizer = loadFreshModule();
    (mockSails.log.verbose as sinon.SinonStub).throws(new Error('logger unavailable'));
    expect(sanitizer.warmSanitizer()).to.equal('warm');
  });
});
