import { TestBed } from '@angular/core/testing';
import { UtilityService } from './utility.service';
import { LoggerService } from './logger.service';

describe('UtilityService', () => {
  let service: UtilityService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        UtilityService,
        LoggerService
      ]
    });

    service = TestBed.inject(UtilityService);
  });

  it('should reuse a single in-flight dynamic import for matching requests', async () => {
    const module = { evaluate: () => 'ok' };
    let resolveImport: ((value: any) => void) | undefined;
    let importStarted!: () => void;
    const started = new Promise<void>(resolve => { importStarted = resolve; });
    const importModuleSpy = spyOn<any>(service, 'importModule').and.callFake(() => {
      return new Promise((resolve) => {
        resolveImport = resolve;
        importStarted();
      });
    });

    const requestA = service.getDynamicImport('http://localhost/default/rdmp', ['dynamicAsset', 'formCompiledItems', 'auto', 'oid-123'], { edit: 'true' });
    const requestB = service.getDynamicImport('http://localhost/default/rdmp', ['dynamicAsset', 'formCompiledItems', 'auto', 'oid-123'], { edit: 'true' });

    await started;
    expect(importModuleSpy).toHaveBeenCalledTimes(1);

    resolveImport?.(module);

    await expectAsync(requestA).toBeResolvedTo(module);
    await expectAsync(requestB).toBeResolvedTo(module);
  });

  it('should clear a failed dynamic import from the cache so the next request can retry', async () => {
    const error = new Error('import failed');
    const module = { evaluate: () => 'ok' };
    const importModuleSpy = spyOn<any>(service, 'importModule').and.returnValues(
      Promise.reject(error),
      Promise.resolve(module)
    );

    await expectAsync(
      service.getDynamicImport('http://localhost/default/rdmp', ['dynamicAsset', 'formCompiledItems', 'auto', 'oid-123'], { edit: 'true' })
    ).toBeRejectedWith(error);

    await expectAsync(
      service.getDynamicImport('http://localhost/default/rdmp', ['dynamicAsset', 'formCompiledItems', 'auto', 'oid-123'], { edit: 'true' })
    ).toBeResolvedTo(module);

    expect(importModuleSpy).toHaveBeenCalledTimes(2);
  });

  it('should keep edit and view requests in separate cache entries', async () => {
    const editModule = { evaluate: () => 'edit' };
    const viewModule = { evaluate: () => 'view' };
    const importModuleSpy = spyOn<any>(service, 'importModule').and.returnValues(
      Promise.resolve(editModule),
      Promise.resolve(viewModule)
    );

    await expectAsync(
      service.getDynamicImport('http://localhost/default/rdmp', ['dynamicAsset', 'formCompiledItems', 'auto', 'oid-123'], { edit: 'true' })
    ).toBeResolvedTo(editModule);

    await expectAsync(
      service.getDynamicImport('http://localhost/default/rdmp', ['dynamicAsset', 'formCompiledItems', 'auto', 'oid-123'])
    ).toBeResolvedTo(viewModule);

    expect(importModuleSpy).toHaveBeenCalledTimes(2);
  });

  it('serializes object, repeated array and scalar parameters after loading the helpers', async () => {
    const importModuleSpy = spyOn<any>(service, 'importModule').and.resolveTo({});
    await service.getDynamicImport('http://localhost/default/rdmp', ['dynamicAsset', 'template'], {
      settings: { enabled: true }, tags: ['one', 'two'], page: 2, preview: false, empty: null
    });
    const url = new URL(importModuleSpy.calls.mostRecent().args[0] as string);
    expect(url.searchParams.get('settings')).toBe('{"enabled":true}');
    expect(url.searchParams.getAll('tags')).toEqual(['one', 'two']);
    expect(url.searchParams.get('page')).toBe('2');
    expect(url.searchParams.get('preview')).toBe('false');
    expect(url.searchParams.get('empty')).toBe('null');
    expect(url.searchParams.get('apiVersion')).toBe('2.0');
  });
});
