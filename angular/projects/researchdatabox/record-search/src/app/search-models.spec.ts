import { RecordSearchParams, RecordSearchRefiner } from './search-models';

describe('RecordSearchRefiner', () => {
  it('should create with defaults', () => {
    const refiner = new RecordSearchRefiner();
    expect(refiner.name).toBe('');
    expect(refiner.title).toBe('');
    expect(refiner.type).toBe('exact');
    expect(refiner.value).toBeNull();
    expect(refiner.alwaysActive).toBe(false);
    expect(refiner.activeValue).toBeNull();
  });

  it('should create with provided options', () => {
    const refiner = new RecordSearchRefiner({
      name: 'testRefiner',
      title: 'Test Refiner',
      type: 'facet',
      value: 'someValue',
      alwaysActive: true,
      typeLabel: 'Type Label',
    });
    expect(refiner.name).toBe('testRefiner');
    expect(refiner.title).toBe('Test Refiner');
    expect(refiner.type).toBe('facet');
    expect(refiner.value).toBe('someValue');
    expect(refiner.alwaysActive).toBe(true);
    expect(refiner.typeLabel).toBe('Type Label');
  });

  it('setCurrentValue should set activeValue for facet type', () => {
    const refiner = new RecordSearchRefiner({ name: 'test', type: 'facet' });
    refiner.setCurrentValue('facetVal');
    expect(refiner.activeValue).toBe('facetVal');
    expect(refiner.value).toBeNull();
  });

  it('setCurrentValue should set value for exact type', () => {
    const refiner = new RecordSearchRefiner({ name: 'test', type: 'exact' });
    refiner.setCurrentValue('exactVal');
    expect(refiner.value).toBe('exactVal');
  });
});

describe('RecordSearchParams', () => {
  let params: RecordSearchParams;

  beforeEach(() => {
    params = new RecordSearchParams('rdmp');
  });

  it('should create with correct defaults', () => {
    expect(params.recordType).toBe('rdmp');
    expect(params.basicSearch).toBeNull();
    expect(params.activeRefiners).toEqual([]);
    expect(params.rows).toBe(10);
    expect(params.currentPage).toBe(1);
  });

  it('clear should reset search state', () => {
    params.basicSearch = 'test query';
    params.currentPage = 5;
    const alwaysActiveRefiner = new RecordSearchRefiner({ name: 'active', alwaysActive: true, type: 'exact' });
    alwaysActiveRefiner.value = 'someVal';
    const tempRefiner = new RecordSearchRefiner({ name: 'temp', alwaysActive: false, type: 'exact' });
    tempRefiner.value = 'tempVal';
    params.activeRefiners = [alwaysActiveRefiner, tempRefiner];

    params.clear();

    expect(params.basicSearch).toBeNull();
    expect(params.currentPage).toBe(1);
    // Always-active refiners should remain
    expect(params.activeRefiners.length).toBe(1);
    expect(params.activeRefiners[0].name).toBe('active');
    // But their values should be cleared
    expect(params.activeRefiners[0].value).toBeNull();
  });

  it('setRefinerConfig should activate alwaysActive refiners', () => {
    const config = [
      new RecordSearchRefiner({ name: 'facetRefiner', type: 'facet', alwaysActive: true }),
      new RecordSearchRefiner({ name: 'exactRefiner', type: 'exact', alwaysActive: false }),
    ];
    params.setRefinerConfig(config);

    expect(params.refinerConfig.length).toBe(2);
    expect(params.activeRefiners.length).toBe(1);
    expect(params.activeRefiners[0].name).toBe('facetRefiner');
  });

  it('getRefinerConfig should find by name', () => {
    const config = [
      new RecordSearchRefiner({ name: 'refA', type: 'exact' }),
      new RecordSearchRefiner({ name: 'refB', type: 'facet' }),
    ];
    params.setRefinerConfig(config);

    expect(params.getRefinerConfig('refA')?.name).toBe('refA');
    expect(params.getRefinerConfig('refB')?.type).toBe('facet');
    expect(params.getRefinerConfig('nonexistent')).toBeUndefined();
  });

  it('addActiveRefiner should add new refiner', () => {
    const refiner = new RecordSearchRefiner({ name: 'test', type: 'exact' });
    refiner.value = 'val';
    params.addActiveRefiner(refiner);

    expect(params.activeRefiners.length).toBe(1);
    expect(params.activeRefiners[0].value).toBe('val');
  });

  it('addActiveRefiner should update existing refiner', () => {
    const refiner1 = new RecordSearchRefiner({ name: 'test', type: 'exact' });
    refiner1.value = 'val1';
    params.addActiveRefiner(refiner1);

    const refiner2 = new RecordSearchRefiner({ name: 'test', type: 'exact' });
    refiner2.value = 'val2';
    params.addActiveRefiner(refiner2);

    expect(params.activeRefiners.length).toBe(1);
    expect(params.activeRefiners[0].value).toBe('val2');
  });

  it('getHttpQuery should build correct query string', () => {
    params.basicSearch = 'test search';
    params.currentPage = 2;
    const result = params.getHttpQuery('record/search');
    expect(result).toBe('record/search?q=test%20search&type=rdmp&page=2');
  });

  it('getHttpQuery should include refiner values', () => {
    params.basicSearch = 'test';
    const exactRefiner = new RecordSearchRefiner({ name: 'author', type: 'exact' });
    exactRefiner.value = 'John';
    params.addActiveRefiner(exactRefiner);

    const facetRefiner = new RecordSearchRefiner({ name: 'category', type: 'facet' });
    facetRefiner.activeValue = 'science';
    params.addActiveRefiner(facetRefiner);

    const result = params.getHttpQuery('record/search');
    expect(result).toContain('refiner|author=John');
    expect(result).toContain('refiner|category=science');
  });

  it('parseQueryStr should parse basic search', () => {
    params.setRefinerConfig([]);
    params.parseQueryStr('q=hello%20world&page=3');

    expect(params.basicSearch).toBe('hello world');
    expect(params.currentPage).toBe(3);
  });

  it('parseQueryStr should parse refiners', () => {
    const config = [
      new RecordSearchRefiner({ name: 'author', type: 'exact' }),
      new RecordSearchRefiner({ name: 'category', type: 'facet' }),
    ];
    params.setRefinerConfig(config);

    params.parseQueryStr('q=test&refiner|author=John&refiner|category=science&page=1');

    expect(params.basicSearch).toBe('test');
    expect(params.activeRefiners.length).toBe(2);
  });

  it('filterActiveRefinersWithNoData should remove empty non-alwaysActive refiners', () => {
    const refiner1 = new RecordSearchRefiner({ name: 'empty', type: 'exact', alwaysActive: false });
    const refiner2 = new RecordSearchRefiner({ name: 'active', type: 'exact', alwaysActive: true });
    const refiner3 = new RecordSearchRefiner({ name: 'filled', type: 'exact', alwaysActive: false });
    refiner3.value = 'val';
    params.activeRefiners = [refiner1, refiner2, refiner3];

    params.filterActiveRefinersWithNoData();

    expect(params.activeRefiners.length).toBe(2);
    expect(params.activeRefiners.map(r => r.name)).toContain('active');
    expect(params.activeRefiners.map(r => r.name)).toContain('filled');
  });

  it('hasActiveRefiners should return true when refiner has value', () => {
    expect(params.hasActiveRefiners()).toBe(false);

    const refiner = new RecordSearchRefiner({ name: 'test', type: 'exact' });
    refiner.value = 'val';
    params.activeRefiners = [refiner];

    expect(params.hasActiveRefiners()).toBe(true);
  });

  it('hasActiveRefiners should return true when facet refiner has active value', () => {
    const refiner = new RecordSearchRefiner({ name: 'facet', type: 'facet' });
    refiner.activeValue = 'science';
    params.activeRefiners = [refiner];

    expect(params.hasActiveRefiners()).toBe(true);
  });

  it('setFacetValues should update active refiner values', () => {
    const refiner = new RecordSearchRefiner({ name: 'category', type: 'facet' });
    params.activeRefiners = [refiner];

    const facets = [{ name: 'category', values: [{ value: 'A', count: 5 }] }];
    params.setFacetValues(facets);

    expect(params.activeRefiners[0].value).toEqual([{ value: 'A', count: 5 }]);
  });
});
