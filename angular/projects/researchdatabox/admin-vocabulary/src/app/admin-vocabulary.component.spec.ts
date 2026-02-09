import { TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { APP_BASE_HREF } from '@angular/common';
import { AdminVocabularyComponent } from './admin-vocabulary.component';
import { VocabularyApiService } from './vocabulary-api.service';
import { LoggerService, TranslationService } from '@researchdatabox/portal-ng-common';
import { VocabListComponent } from './vocab-list.component';
import { VocabDetailComponent } from './vocab-detail.component';
import { RvaImportComponent } from './rva-import.component';

class VocabularyApiServiceStub {
  async waitForInit(): Promise<this> { return this; }
  async list() { return []; }
  async get(_id: string) { return { vocabulary: { name: 'One', type: 'flat', source: 'local' }, entries: [] }; }
  async create(payload: unknown) { return payload; }
  async update(_id: string, payload: unknown) { return payload; }
  async delete(_id: string) { return; }
  async importRva(_rvaId: string) { return { name: 'Imported', type: 'flat', source: 'rva' }; }
  async sync(_id: string) { return { created: 0, updated: 0, skipped: 0, lastSyncedAt: new Date().toISOString() }; }
}

class TranslationServiceStub {
  async waitForInit(): Promise<this> { return this; }
  t(value: string): string { return value; }
}

describe('AdminVocabularyComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [AdminVocabularyComponent, VocabListComponent, VocabDetailComponent, RvaImportComponent],
      imports: [FormsModule],
      providers: [
        { provide: APP_BASE_HREF, useValue: '/' },
        { provide: VocabularyApiService, useClass: VocabularyApiServiceStub },
        { provide: TranslationService, useClass: TranslationServiceStub },
        LoggerService
      ]
    }).compileComponents();
  });

  it('creates and initializes', async () => {
    const fixture = TestBed.createComponent(AdminVocabularyComponent);
    const component = fixture.componentInstance;
    fixture.autoDetectChanges();

    await component.waitForInit();
    expect(component).toBeTruthy();
    expect(component.vocabularies).toEqual([]);
  });

  it('imports vocabulary by rva id', async () => {
    const fixture = TestBed.createComponent(AdminVocabularyComponent);
    const component = fixture.componentInstance;
    const api = TestBed.inject(VocabularyApiService);

    spyOn(api, 'list').and.returnValues(
      Promise.resolve([]),
      Promise.resolve([{ id: 'v1', name: 'Imported', slug: 'imported', type: 'flat', source: 'rva' }])
    );

    fixture.detectChanges();
    await component.waitForInit();
    await component.importRva('rva:test');
    expect(component.error).toBe('');
    expect(component.vocabularies.length).toBe(1);
    expect(component.vocabularies[0].name).toBe('Imported');
  });

  it('extracts numeric rva id from url before importing', async () => {
    const fixture = TestBed.createComponent(AdminVocabularyComponent);
    const component = fixture.componentInstance;
    const api = TestBed.inject(VocabularyApiService);

    const importSpy = spyOn(api, 'importRva').and.resolveTo({ name: 'Imported', type: 'flat', source: 'rva' });
    spyOn(api, 'list').and.resolveTo([]);

    await component.importRva('https://vocabs.ardc.edu.au/viewById/365');

    expect(importSpy).toHaveBeenCalledWith('365');
    expect(component.error).toBe('');
  });

  it('sets import status for progress and success', async () => {
    const fixture = TestBed.createComponent(AdminVocabularyComponent);
    const component = fixture.componentInstance;
    const api = TestBed.inject(VocabularyApiService);

    let resolveImport: ((value: { name: string; type: 'flat'; source: 'rva' }) => void) | undefined;
    const pendingImport = new Promise<{ name: string; type: 'flat'; source: 'rva' }>((resolve) => {
      resolveImport = resolve;
    });

    spyOn(api, 'importRva').and.returnValue(pendingImport);
    spyOn(api, 'list').and.resolveTo([]);

    const importPromise = component.importRva('123');

    expect(component.isImportInProgress).toBeTrue();
    expect(component.importStatusVariant).toBe('info');
    expect(component.importStatusMessage).toBe('Import in progress...');

    if (!resolveImport) {
      fail('resolveImport callback not set');
      return;
    }
    resolveImport({ name: 'Imported', type: 'flat', source: 'rva' });
    await importPromise;

    expect(component.isImportInProgress).toBeFalse();
    expect(component.importStatusVariant).toBe('success');
    expect(component.importStatusMessage).toBe('RVA vocabulary imported successfully.');
  });

  it('flattens nested tree entries when opening a vocabulary', async () => {
    const fixture = TestBed.createComponent(AdminVocabularyComponent);
    const component = fixture.componentInstance;
    const api = TestBed.inject(VocabularyApiService);

    spyOn(api, 'get').and.resolveTo({
      vocabulary: { id: 'v1', name: 'Tree', type: 'tree', source: 'rva' },
      entries: [
        {
          id: 'parent',
          label: 'Parent',
          value: '30',
          children: [
            {
              id: 'child',
              label: 'Child',
              value: '3001',
              parent: 'parent',
              children: []
            }
          ]
        }
      ]
    });

    await component.openVocabulary('v1');

    expect(component.draft.entries?.length).toBe(2);
    expect(component.draft.entries?.[0].id).toBe('parent');
    expect(component.draft.entries?.[1].id).toBe('child');
    expect(component.draft.entries?.[1].parent).toBe('parent');
  });
});
