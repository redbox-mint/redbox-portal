import {
  isEmpty as _isEmpty,
  isUndefined as _isUndefined,
  find as _find,
  forEach as _forEach,
  remove as _remove,
  startsWith as _startsWith,
  toNumber as _toNumber,
  forOwn as _forOwn,
} from 'lodash-es';

/**
 * Represents a single search refiner (filter/facet).
 */
export class RecordSearchRefiner {
  name: string;
  title: string;
  type: string; // 'exact' or 'facet'
  value: any;
  alwaysActive: boolean;
  typeLabel: string;
  activeValue: any;

  constructor(opts: any = {}) {
    this.name = opts.name ?? '';
    this.title = opts.title ?? '';
    this.type = opts.type ?? 'exact';
    this.value = opts.value ?? null;
    this.typeLabel = opts.typeLabel ?? '';
    this.alwaysActive = opts.alwaysActive ?? false;
    this.activeValue = null;
  }

  setCurrentValue(value: any): void {
    if (this.type === 'facet') {
      this.activeValue = value;
    } else {
      this.value = value;
    }
  }
}

/**
 * Encapsulates the parameters for a record search query.
 */
export class RecordSearchParams {
  recordType: string;
  basicSearch: string | null;
  activeRefiners: RecordSearchRefiner[];
  refinerConfig: RecordSearchRefiner[];
  rows: number = 10;
  currentPage: number = 1;

  constructor(recType: string) {
    this.recordType = recType;
    this.activeRefiners = [];
    this.refinerConfig = [];
    this.basicSearch = null;
  }

  clear(): void {
    this.basicSearch = null;
    this.currentPage = 1;
    _remove(this.activeRefiners, (refiner: RecordSearchRefiner) => {
      refiner.value = null;
      refiner.activeValue = null;
      return !refiner.alwaysActive;
    });
  }

  getRefinerConfig(name: string): RecordSearchRefiner | undefined {
    return _find(this.refinerConfig, (config: RecordSearchRefiner) => {
      return config.name === name;
    });
  }

  setRefinerConfig(config: RecordSearchRefiner[]): void {
    this.refinerConfig = config;
    _forEach(this.refinerConfig, (refinerConfig: RecordSearchRefiner) => {
      if (refinerConfig.alwaysActive) {
        this.addActiveRefiner(refinerConfig);
      }
    });
  }

  getHttpQuery(searchUrl: string): string {
    let refinerValues = '';
    _forEach(this.activeRefiners, (refiner: RecordSearchRefiner) => {
      if (refiner.type === 'facet') {
        const value = _isEmpty(refiner.activeValue) ? '' : encodeURIComponent(refiner.activeValue);
        refinerValues = `${refinerValues}&refiner|${refiner.name}=${value}`;
      } else {
        const value = _isEmpty(refiner.value) ? '' : encodeURIComponent(refiner.value);
        refinerValues = `${refinerValues}&refiner|${refiner.name}=${value}`;
      }
    });
    return `${searchUrl}?q=${encodeURIComponent(this.basicSearch ?? '')}&type=${this.recordType}${refinerValues}&page=${this.currentPage}`;
  }

  getRefinerConfigs(): RecordSearchRefiner[] {
    return this.refinerConfig;
  }

  addActiveRefiner(refiner: RecordSearchRefiner): void {
    const existingRefiner = _find(this.activeRefiners, (activeRefiner: RecordSearchRefiner) => {
      return activeRefiner.name === refiner.name;
    });
    if (existingRefiner) {
      existingRefiner.value = refiner.value;
    } else {
      this.activeRefiners.push(refiner);
    }
  }

  parseQueryStr(queryStr: string): void {
    const refinerValues: Record<string, string> = {};
    _forEach(queryStr.split('&'), (q: string) => {
      const qObj = q.split('=');
      if (_startsWith(qObj[0], 'q')) {
        this.basicSearch = decodeURIComponent((qObj[1] ?? '').replace(/\+/gi, ' '));
      }
      if (_startsWith(qObj[0], 'refiner|')) {
        const refinerName = qObj[0].split('|')[1];
        refinerValues[refinerName] = decodeURIComponent((qObj[1] ?? '').replace(/\+/gi, ' '));
      }
      if (_startsWith(qObj[0], 'page')) {
        this.currentPage = _toNumber(qObj[1]);
      }
    });
    _forOwn(refinerValues, (value: string, name: string) => {
      const config = this.getRefinerConfig(name);
      if (config) {
        config.setCurrentValue(value);
        this.addActiveRefiner(config);
      }
    });
  }

  filterActiveRefinersWithNoData(): void {
    _remove(this.activeRefiners, (refiner: RecordSearchRefiner) => {
      const value = refiner.type === 'exact' ? refiner.value : refiner.activeValue;
      return !refiner.alwaysActive && (_isEmpty(value) || _isUndefined(value));
    });
  }

  hasActiveRefiners(): boolean {
    let hasActive = false;
    _forEach(this.activeRefiners, (refiner: RecordSearchRefiner) => {
      if (!hasActive) {
        const value = refiner.type === 'facet' ? refiner.activeValue : refiner.value;
        if (!_isEmpty(value)) {
          hasActive = true;
        }
      }
    });
    return hasActive;
  }

  setFacetValues(facets: any): void {
    _forEach(facets, (facet: any) => {
      const refiner = _find(this.activeRefiners, (refinerConfig: RecordSearchRefiner) => {
        return refinerConfig.name === facet.name;
      });
      if (refiner) {
        refiner.value = facet.values;
      }
    });
  }
}
