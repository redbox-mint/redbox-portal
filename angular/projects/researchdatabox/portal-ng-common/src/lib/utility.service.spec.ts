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
    const importModuleSpy = spyOn<any>(service, 'importModule').and.callFake(() => {
      return new Promise((resolve) => {
        resolveImport = resolve;
      });
    });

    const requestA = service.getDynamicImport('http://localhost/default/rdmp', ['dynamicAsset', 'formCompiledItems', 'auto', 'oid-123'], { edit: 'true' });
    const requestB = service.getDynamicImport('http://localhost/default/rdmp', ['dynamicAsset', 'formCompiledItems', 'auto', 'oid-123'], { edit: 'true' });

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
});
