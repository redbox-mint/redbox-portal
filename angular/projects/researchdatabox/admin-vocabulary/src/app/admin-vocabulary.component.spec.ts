import { TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { APP_BASE_HREF } from '@angular/common';
import { Pipe, PipeTransform } from '@angular/core';
import { AdminVocabularyComponent } from './admin-vocabulary.component';
import { VocabularyApiService } from './vocabulary-api.service';
import { LoggerService, TranslationService } from '@researchdatabox/portal-ng-common';
import { VocabListComponent } from './vocab-list.component';
import { VocabDetailComponent } from './vocab-detail.component';
import { RvaImportComponent } from './rva-import.component';

@Pipe({ name: 'i18next', standalone: false })
class I18NextPipeStub implements PipeTransform {
  transform(value: string): string {
    return value;
  }
}

class VocabularyApiServiceStub {
  async waitForInit(): Promise<this> { return this; }
  async list() { return { data: [], meta: { total: 0, limit: 25, offset: 0 } }; }
  async get(_id: string) { return { vocabulary: { name: 'One', type: 'flat', source: 'local' }, entries: [] }; }
  async create(payload: unknown) { return payload; }
  async update(_id: string, payload: unknown) { return payload; }
  async delete(_id: string) { return; }
  async importRva(_rvaId: string) { return { name: 'Imported', type: 'flat', source: 'rva' }; }
  async sync(_id: string) { return { created: 0, updated: 0, skipped: 0, lastSyncedAt: new Date().toISOString() }; }
}

class TranslationServiceStub {
  async waitForInit(): Promise<this> { return this; }
  t(value: string, defaultValue?: string): string { return defaultValue || value; }
}

describe('AdminVocabularyComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [AdminVocabularyComponent, VocabListComponent, VocabDetailComponent, RvaImportComponent, I18NextPipeStub],
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
      Promise.resolve({ data: [], meta: { total: 0, limit: 25, offset: 0 } }),
      Promise.resolve({
        data: [{ id: 'v1', name: 'Imported', slug: 'imported', type: 'flat', source: 'rva' }],
        meta: { total: 1, limit: 25, offset: 0 }
      })
    );

    fixture.detectChanges();
    await component.waitForInit();
    await component.importRva('rva:test');
    expect(component.error).toBe('');
    expect(component.vocabularies.length).toBe(1);
    expect(component.vocabularies[0].name).toBe('Imported');
  });

  it('passes url input through to backend import resolver', async () => {
    const fixture = TestBed.createComponent(AdminVocabularyComponent);
    const component = fixture.componentInstance;
    const api = TestBed.inject(VocabularyApiService);

    const importSpy = spyOn(api, 'importRva').and.resolveTo({ name: 'Imported', type: 'flat', source: 'rva' });
    spyOn(api, 'list').and.resolveTo({ data: [], meta: { total: 0, limit: 25, offset: 0 } });

    await component.importRva('https://vocabs.ardc.edu.au/repository/api/lda/anzsrc-for/2020');

    expect(importSpy).toHaveBeenCalledWith('https://vocabs.ardc.edu.au/repository/api/lda/anzsrc-for/2020');
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
    spyOn(api, 'list').and.resolveTo({ data: [], meta: { total: 0, limit: 25, offset: 0 } });

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

  it('opens sync confirmation without syncing immediately', async () => {
    const fixture = TestBed.createComponent(AdminVocabularyComponent);
    const component = fixture.componentInstance;
    const api = TestBed.inject(VocabularyApiService);

    component.isEditModalOpen = true;
    component.selectedVocabulary = { id: 'v1', name: 'RVA', type: 'tree', source: 'rva' };
    component.draft = { ...component.selectedVocabulary, entries: [] };
    const syncSpy = spyOn(api, 'sync').and.callThrough();

    await component.syncSelected();

    expect(syncSpy).not.toHaveBeenCalled();
    expect(component.isSyncConfirmationOpen).toBeTrue();
    expect(component.syncStatusVariant).toBe('warning');
    expect(component.syncStatusMessage).toContain('replace local changes');
    expect(component.isSyncInProgress).toBeFalse();
  });

  it('cancels pending sync confirmation', async () => {
    const fixture = TestBed.createComponent(AdminVocabularyComponent);
    const component = fixture.componentInstance;

    component.isEditModalOpen = true;
    component.selectedVocabulary = { id: 'v1', name: 'RVA', type: 'tree', source: 'rva' };
    component.draft = { ...component.selectedVocabulary, entries: [] };

    await component.syncSelected();
    component.cancelSyncConfirmation();

    expect(component.isSyncConfirmationOpen).toBeFalse();
    expect(component.syncStatusMessage).toBe('');
    expect(component.syncStatusVariant).toBe('');
  });

  it('shows sync in-progress and completion state when syncing confirmed vocabulary', async () => {
    const fixture = TestBed.createComponent(AdminVocabularyComponent);
    const component = fixture.componentInstance;
    const api = TestBed.inject(VocabularyApiService);

    component.isEditModalOpen = true;
    component.selectedVocabulary = { id: 'v1', name: 'RVA', type: 'tree', source: 'rva' };
    component.draft = { ...component.selectedVocabulary, entries: [] };

    spyOn(api, 'list').and.resolveTo({ data: [], meta: { total: 0, limit: 25, offset: 0 } });
    spyOn(api, 'get').and.resolveTo({
      vocabulary: { id: 'v1', name: 'RVA', type: 'tree', source: 'rva' },
      entries: []
    });

    let resolveSync: ((value: { created: number; updated: number; skipped: number; lastSyncedAt: string }) => void) | undefined;
    const pendingSync = new Promise<{ created: number; updated: number; skipped: number; lastSyncedAt: string }>((resolve) => {
      resolveSync = resolve;
    });
    spyOn(api, 'sync').and.returnValue(pendingSync);

    await component.syncSelected();
    const syncPromise = component.confirmSyncSelected();

    expect(component.isSyncInProgress).toBeTrue();
    expect(component.isSyncConfirmationOpen).toBeFalse();
    expect(component.syncStatusVariant).toBe('info');
    expect(component.syncStatusMessage).toBe('Sync in progress...');

    if (!resolveSync) {
      fail('resolveSync callback not set');
      return;
    }
    resolveSync({ created: 1, updated: 2, skipped: 0, lastSyncedAt: new Date().toISOString() });
    await syncPromise;

    expect(component.isSyncInProgress).toBeFalse();
    expect(component.syncStatusVariant).toBe('success');
    expect(component.syncStatusMessage).toBe('Sync completed successfully.');
  });

  it('auto-clears sync success status after a short delay', async () => {
    const fixture = TestBed.createComponent(AdminVocabularyComponent);
    const component = fixture.componentInstance;
    const api = TestBed.inject(VocabularyApiService);

    component.isEditModalOpen = true;
    component.selectedVocabulary = { id: 'v1', name: 'RVA', type: 'tree', source: 'rva' };
    component.draft = { ...component.selectedVocabulary, entries: [] };

    spyOn(api, 'list').and.resolveTo({ data: [], meta: { total: 0, limit: 25, offset: 0 } });
    spyOn(api, 'get').and.resolveTo({
      vocabulary: { id: 'v1', name: 'RVA', type: 'tree', source: 'rva' },
      entries: []
    });
    spyOn(api, 'sync').and.resolveTo({ created: 1, updated: 0, skipped: 0, lastSyncedAt: new Date().toISOString() });

    let timeoutCallback: (() => void) | undefined;
    spyOn(globalThis, 'setTimeout').and.callFake((callback: TimerHandler) => {
      timeoutCallback = callback as () => void;
      return 1 as unknown as number;
    });

    await component.syncSelected();
    await component.confirmSyncSelected();

    expect(component.syncStatusVariant).toBe('success');
    expect(component.syncStatusMessage).toBe('Sync completed successfully.');
    expect(timeoutCallback).toBeDefined();

    if (!timeoutCallback) {
      fail('timeoutCallback not set');
      return;
    }
    timeoutCallback();

    expect(component.syncStatusMessage).toBe('');
    expect(component.syncStatusVariant).toBe('');
  });
});
