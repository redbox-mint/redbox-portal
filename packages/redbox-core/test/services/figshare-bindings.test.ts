import * as sinon from 'sinon';
import { createRequire } from 'node:module';

const testRequire = createRequire(__filename);
const { cleanupServiceTestGlobals, createMockSails, setupServiceTestGlobals } = testRequire('./testHelper');
const { evaluateBinding, resolveCrosswalkBinding } = testRequire('../../src/services/figshare-v2/bindings');
const { createBindingContext } = testRequire('../../src/services/figshare-v2/context');

let expect!: Chai.ExpectStatic;

before(async function () {
  ({ expect } = await import('chai'));
});

/**
 * chai-as-promised is not wired into this suite, so rejections are asserted by hand.
 */
async function expectRejection(promise: Promise<unknown>, pattern: RegExp): Promise<void> {
  try {
    await promise;
  } catch (error) {
    expect(error instanceof Error ? error.message : String(error)).to.match(pattern);
    return;
  }
  expect.fail(`Expected a rejection matching ${pattern}`);
}

/**
 * Direct coverage for `evaluateBinding`. The simple-kind cases lock in behaviour
 * that had no test at all before the crosswalk kind was added — in particular the
 * `defaultValue` fallbacks, which the crosswalk branch also relies on.
 */
describe('figshare-v2 bindings', function () {
  const record = {
    metadata: {
      title: 'Dataset title',
      empty: '',
      forCodes: ['0101', '0102'],
      forObjects: [{ notation: '0101' }, { code: '0102' }],
      count: 2,
    },
  };

  let resolveCrosswalkValuesStub: sinon.SinonStub;

  beforeEach(function () {
    setupServiceTestGlobals(createMockSails());
    resolveCrosswalkValuesStub = sinon.stub().resolves({
      values: [10, 20],
      normalizedCodes: ['0101', '0102'],
      unresolvedCodes: [],
      historicalTargets: [],
    });
    (global as any).FigshareVocabularyService = {
      resolveCrosswalkValues: resolveCrosswalkValuesStub,
    };
    (global as any).BrandingService = {
      getBrand: sinon.stub().returns({ id: 'default-id', name: 'default' }),
      getBrandById: sinon.stub().returns(undefined),
    };
  });

  afterEach(function () {
    cleanupServiceTestGlobals();
    delete (global as any).FigshareVocabularyService;
    delete (global as any).BrandingService;
    sinon.restore();
  });

  describe('simple kinds', function () {
    it('returns undefined for a missing binding', async function () {
      expect(await evaluateBinding(undefined, record)).to.equal(undefined);
    });

    it('reads a path binding', async function () {
      const value = await evaluateBinding({ kind: 'path', path: 'metadata.title' }, record);
      expect(value).to.equal('Dataset title');
    });

    it('falls back to defaultValue when a path misses', async function () {
      const value = await evaluateBinding(
        { kind: 'path', path: 'metadata.nope', defaultValue: 'fallback' },
        record
      );
      expect(value).to.equal('fallback');
    });

    it('falls back to defaultValue when a path resolves to null', async function () {
      const value = await evaluateBinding(
        { kind: 'path', path: 'metadata.missing', defaultValue: [] },
        { metadata: { missing: null } }
      );
      expect(value).to.deep.equal([]);
    });

    it('renders a handlebars binding', async function () {
      const value = await evaluateBinding(
        { kind: 'handlebars', template: '{{metadata.title}}!' },
        record
      );
      expect(value).to.equal('Dataset title!');
    });

    it('falls back to defaultValue when handlebars renders empty', async function () {
      const value = await evaluateBinding(
        { kind: 'handlebars', template: '{{metadata.empty}}', defaultValue: 'fallback' },
        record
      );
      expect(value).to.equal('fallback');
    });

    it('evaluates a jsonata binding', async function () {
      const value = await evaluateBinding(
        { kind: 'jsonata', expression: 'metadata.count + 1' },
        record
      );
      expect(value).to.equal(3);
    });

    it('falls back to defaultValue when jsonata yields nothing', async function () {
      const value = await evaluateBinding(
        { kind: 'jsonata', expression: 'metadata.nope', defaultValue: 'fallback' },
        record
      );
      expect(value).to.equal('fallback');
    });

    /**
     * Before the explicit-kind refactor jsonata was an implicit `else`, so an
     * unknown kind failed with a baffling JSONata parse error instead.
     */
    it('throws a clear error for an unknown kind', async function () {
      await expectRejection(
        evaluateBinding({ kind: 'bogus' } as any, record),
        /Unsupported Figshare binding kind 'bogus'/
      );
    });
  });

  describe('crosswalk kind', function () {
    const crosswalkBinding = {
      kind: 'crosswalk' as const,
      source: { kind: 'path' as const, path: 'metadata.forCodes' },
      sourceVocabularyId: 'vocab-1',
      crosswalkId: 'crosswalk-1',
      outputs: 'categoryId' as const,
    };

    function contextFor(brand: unknown = 'default') {
      return createBindingContext({ metaMetadata: { brandId: brand } } as any);
    }

    it('resolves codes through the vocabulary service', async function () {
      const value = await evaluateBinding(crosswalkBinding, record, contextFor());

      expect(value).to.deep.equal([10, 20]);
      // The context resolves the brand *name* through BrandingService to its ID.
      sinon.assert.calledOnceWithExactly(resolveCrosswalkValuesStub, {
        brandId: 'default-id',
        crosswalkId: 'crosswalk-1',
        sourceVocabularyId: 'vocab-1',
        codes: ['0101', '0102'],
        outputs: 'categoryId',
      });
    });

    it('reduces object values through notation then code', async function () {
      await evaluateBinding(
        { ...crosswalkBinding, source: { kind: 'path', path: 'metadata.forObjects' } },
        record,
        contextFor()
      );

      expect(resolveCrosswalkValuesStub.firstCall.args[0].codes).to.deep.equal(['0101', '0102']);
    });

    it('short-circuits without calling the service when the source is empty', async function () {
      const result = await resolveCrosswalkBinding(
        { ...crosswalkBinding, source: { kind: 'path', path: 'metadata.nothingHere' } },
        record,
        contextFor()
      );

      expect(result.values).to.deep.equal([]);
      expect(result.sourceCodes).to.deep.equal([]);
      sinon.assert.notCalled(resolveCrosswalkValuesStub);
    });

    it('passes the requested output mode through', async function () {
      resolveCrosswalkValuesStub.resolves({
        values: ['Agronomy'],
        normalizedCodes: ['0101'],
        unresolvedCodes: [],
        historicalTargets: [],
      });

      const value = await evaluateBinding({ ...crosswalkBinding, outputs: 'label' }, record, contextFor());

      expect(value).to.deep.equal(['Agronomy']);
      expect(resolveCrosswalkValuesStub.firstCall.args[0].outputs).to.equal('label');
    });

    it('defaults the output mode to categoryId when omitted', async function () {
      const { outputs, ...withoutOutputs } = crosswalkBinding;
      await evaluateBinding(withoutOutputs as any, record, contextFor());

      expect(resolveCrosswalkValuesStub.firstCall.args[0].outputs).to.equal('categoryId');
    });

    it('falls back to defaultValue when nothing resolves', async function () {
      resolveCrosswalkValuesStub.resolves({
        values: [],
        normalizedCodes: ['0101'],
        unresolvedCodes: ['0101'],
        historicalTargets: [],
      });

      const value = await evaluateBinding(
        { ...crosswalkBinding, defaultValue: ['none'] },
        record,
        contextFor()
      );

      expect(value).to.deep.equal(['none']);
      sinon.assert.calledWithMatch((global as any).sails.log.warn, /could not resolve: 0101/);
    });

    it('warns rather than silently dropping historical targets', async function () {
      resolveCrosswalkValuesStub.resolves({
        values: [10],
        normalizedCodes: ['0101', '0102'],
        unresolvedCodes: [],
        historicalTargets: [{ code: '0102', categoryId: 99, sourceId: 'src-99' }],
      });

      await evaluateBinding(crosswalkBinding, record, contextFor());

      sinon.assert.calledWithMatch((global as any).sails.log.warn, /historical targets: 0102 → src-99/);
    });

    /** Config arrives as JSON, so the type-level ban on nesting needs a runtime guard. */
    it('rejects a nested crosswalk source', async function () {
      await expectRejection(
        evaluateBinding({ ...crosswalkBinding, source: crosswalkBinding as any }, record, contextFor()),
        /cannot nest another crosswalk binding/
      );
      sinon.assert.notCalled(resolveCrosswalkValuesStub);
    });

    it('throws when the brand cannot be resolved', async function () {
      await expectRejection(
        evaluateBinding(crosswalkBinding, record, contextFor('')),
        /Unable to resolve the brand/
      );
    });

    it('throws when no context is supplied at all', async function () {
      await expectRejection(evaluateBinding(crosswalkBinding, record), /Unable to resolve the brand/);
    });

    it('throws when the crosswalk or vocabulary is unset', async function () {
      await expectRejection(
        evaluateBinding({ ...crosswalkBinding, crosswalkId: '' }, record, contextFor()),
        /require both a source vocabulary and an approved crosswalk/
      );
      await expectRejection(
        evaluateBinding({ ...crosswalkBinding, sourceVocabularyId: '  ' }, record, contextFor()),
        /require both a source vocabulary and an approved crosswalk/
      );
    });

    it('throws when the vocabulary service is unavailable', async function () {
      delete (global as any).FigshareVocabularyService;

      await expectRejection(
        evaluateBinding(crosswalkBinding, record, contextFor()),
        /resolveCrosswalkValues is unavailable/
      );
    });

    /**
     * The evaluation target for an author lookup rule is a contributor object, which
     * carries no brand — this is the case the context parameter exists for.
     */
    it('resolves against a non-record target using the context brand', async function () {
      const contributor = { orcid: '0101' };

      const value = await evaluateBinding(
        { ...crosswalkBinding, source: { kind: 'path', path: 'orcid' } },
        contributor,
        contextFor()
      );

      expect(value).to.deep.equal([10, 20]);
      expect(resolveCrosswalkValuesStub.firstCall.args[0]).to.deep.include({
        brandId: 'default-id',
        codes: ['0101'],
      });
    });
  });
});
