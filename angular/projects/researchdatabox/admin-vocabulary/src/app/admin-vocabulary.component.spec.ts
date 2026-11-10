import { AdminPagerComponent, AdminDiscardDialogComponent, AdminListFooterComponent, getStubTranslationService, AdminCountPipe } from '@researchdatabox/portal-ng-common';
import { fakeAsync, flushMicrotasks, TestBed, tick } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { A11yModule, CdkTrapFocus } from '@angular/cdk/a11y';
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

describe('AdminVocabularyComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [AdminVocabularyComponent, VocabListComponent, VocabDetailComponent, RvaImportComponent, I18NextPipeStub],
      imports: [AdminPagerComponent, AdminDiscardDialogComponent, AdminListFooterComponent, AdminCountPipe, FormsModule, A11yModule],
      providers: [
        { provide: APP_BASE_HREF, useValue: '/' },
        { provide: VocabularyApiService, useClass: VocabularyApiServiceStub },
        { provide: TranslationService, useValue: getStubTranslationService() },
        LoggerService
      ]
    }).compileComponents();
  });

  it('loads the page and all catalogue counts without waiting for another response', fakeAsync(() => {
    const fixture = TestBed.createComponent(AdminVocabularyComponent);
    const component = fixture.componentInstance;
    const pending: Array<(response: any) => void> = [];
    const list = spyOn(TestBed.inject(VocabularyApiService), 'list').and.callFake(() =>
      new Promise(resolve => pending.push(resolve)));
    fixture.detectChanges();
    flushMicrotasks();
    expect(list.calls.allArgs()).toEqual([
      [{ q: undefined, source: undefined, type: undefined, limit: 25, offset: 0 }],
      [{ limit: 1, offset: 0 }],
      [{ source: 'local', limit: 1, offset: 0 }],
      [{ source: 'rva', limit: 1, offset: 0 }]
    ]);
    expect(component.isInitializing()).toBeTrue();
    const vocabulary = { id: 'v1', name: 'One', type: 'flat', source: 'local' };
    pending[0]({ data: [vocabulary], meta: { total: 12, limit: 25, offset: 0 } });
    pending[3]({ data: [], meta: { total: 4 } });
    pending[1]({ data: [], meta: { total: 12 } });
    flushMicrotasks();
    expect(component.isInitializing()).toBeTrue();
    pending[2]({ data: [], meta: { total: 8 } });
    flushMicrotasks();
    expect(component.isInitializing()).toBeFalse();
    expect(component.vocabularies).toEqual([vocabulary] as any);
    expect(component.catalogueCounts).toEqual({ total: 12, local: 8, rva: 4 });
    fixture.destroy();
  }));

  it('still loads the page and retains previous counts when a count request fails', async () => {
    const fixture = TestBed.createComponent(AdminVocabularyComponent);
    const component = fixture.componentInstance;
    component.catalogueCounts = { total: 12, local: 8, rva: 4 };
    spyOn(TestBed.inject(LoggerService), 'error');
    spyOn(TestBed.inject(VocabularyApiService), 'list').and.callFake(async query => {
      if (query?.source === 'local') throw new Error('Count unavailable');
      return { data: [], meta: { total: 0, limit: 25, offset: 0 } };
    });
    fixture.detectChanges();
    await component.waitForInit();
    expect(component.vocabularies).toEqual([]);
    expect(component.error).toBe('');
    expect(component.catalogueCounts).toEqual({ total: 12, local: 8, rva: 4 });
    fixture.destroy();
  });

  it('keeps vocabulary edits and resumes the editor trap after nested Escape', async () => {
    const fixture = TestBed.createComponent(AdminVocabularyComponent);
    fixture.detectChanges(); await fixture.componentInstance.waitForInit();
    fixture.componentInstance.isEditModalOpen = true;
    fixture.componentInstance.draft = { name: 'Unsaved', type: 'flat', source: 'local', entries: [{ label: 'Keep me', value: 'keep' }] };
    fixture.detectChanges(); await fixture.whenStable();
    const detail = fixture.debugElement.query(By.directive(VocabDetailComponent)).componentInstance as VocabDetailComponent;
    detail.requestRemoveEntry(0); fixture.detectChanges(); await fixture.whenStable();
    const traps = fixture.debugElement.queryAll(By.directive(CdkTrapFocus)).map(el => el.injector.get(CdkTrapFocus));
    expect(traps[0].enabled).toBeFalse();
    fixture.nativeElement.querySelector('.entry-remove-modal').dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    fixture.detectChanges(); await fixture.whenStable();
    expect(fixture.componentInstance.isEditModalOpen).toBeTrue();
    expect(detail.isRemoveEntryModalOpen).toBeFalse();
    expect(fixture.componentInstance.draft.name).toBe('Unsaved');
    expect(fixture.componentInstance.draft.entries!.length).toBe(1);
    expect(traps[0].enabled).toBeTrue();
    fixture.destroy();
  });

  it('guards vocabulary edits, preserves Keep editing, and discards only when confirmed', async () => {
    const fixture = TestBed.createComponent(AdminVocabularyComponent);
    const app = fixture.componentInstance;
    fixture.detectChanges(); await app.waitForInit();
    app.newVocabulary(); fixture.detectChanges();
    expect(app.editDirty).toBeFalse();
    app.draft.name = 'Keep this'; app.closeEditModal(); fixture.detectChanges();
    expect(app.confirmDiscard).toBeTrue();
    expect(app.isEditModalOpen).toBeTrue();
    app.confirmDiscard = false;
    expect(app.draft.name).toBe('Keep this');
    app.closeEditModal(); app.discardEdit(); fixture.detectChanges();
    expect(app.isEditModalOpen).toBeFalse();
    fixture.destroy();
  });

  it('creates and initializes' , async () => {
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

    let imported = false;
    spyOn(api, 'importRva').and.callFake(async () => {
      imported = true;
      return { name: 'Imported', type: 'flat', source: 'rva' };
    });
    spyOn(api, 'list').and.callFake(async () => ({
      data: imported ? [{ id: 'v1', name: 'Imported', slug: 'imported', type: 'flat', source: 'rva' }] : [],
      meta: { total: imported ? 1 : 0, limit: 25, offset: 0 }
    }));

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

  it('opens and cancels the vocabulary deletion modal without deleting', () => {
    const fixture = TestBed.createComponent(AdminVocabularyComponent);
    const component = fixture.componentInstance;
    const api = TestBed.inject(VocabularyApiService);

    component.vocabularies = [
      { id: 'v1', name: 'Vocabulary One', slug: 'vocabulary-one', type: 'flat', source: 'local' }
    ];
    const deleteSpy = spyOn(api, 'delete').and.callThrough();

    component.requestDeleteVocabulary('v1');

    expect(component.isDeleteVocabularyModalOpen).toBeTrue();
    expect(component.pendingDeleteVocabularyId).toBe('v1');
    expect(component.pendingDeleteVocabularyName).toBe('Vocabulary One');

    component.cancelDeleteVocabulary();

    expect(component.isDeleteVocabularyModalOpen).toBeFalse();
    expect(component.pendingDeleteVocabularyId).toBeNull();
    expect(component.pendingDeleteVocabularyName).toBe('');
    expect(deleteSpy).not.toHaveBeenCalled();
  });

  it('closes the vocabulary deletion modal when Escape is pressed', () => {
    const fixture = TestBed.createComponent(AdminVocabularyComponent);
    const component = fixture.componentInstance;

    component.vocabularies = [
      { id: 'v1', name: 'Vocabulary One', slug: 'vocabulary-one', type: 'flat', source: 'local' }
    ];

    fixture.detectChanges();
    component.requestDeleteVocabulary('v1');
    fixture.detectChanges();

    const modal = fixture.nativeElement.querySelector('.delete-vocabulary-modal') as HTMLElement;
    modal.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    fixture.detectChanges();

    expect(component.isDeleteVocabularyModalOpen).toBeFalse();
    expect(component.pendingDeleteVocabularyId).toBeNull();
  });

  it('deletes the pending vocabulary when deletion is confirmed', async () => {
    const fixture = TestBed.createComponent(AdminVocabularyComponent);
    const component = fixture.componentInstance;
    const api = TestBed.inject(VocabularyApiService);

    component.vocabularies = [
      { id: 'v1', name: 'Vocabulary One', slug: 'vocabulary-one', type: 'flat', source: 'local' }
    ];
    const deleteSpy = spyOn(api, 'delete').and.resolveTo();
    spyOn(api, 'list').and.resolveTo({ data: [], meta: { total: 0, limit: 25, offset: 0 } });

    component.requestDeleteVocabulary('v1');
    await component.confirmDeleteVocabulary();

    expect(deleteSpy).toHaveBeenCalledWith('v1');
    expect(component.isDeleteVocabularyModalOpen).toBeFalse();
    expect(component.message).toBe('Vocabulary deleted');
  });

  it('restores focus to the delete trigger after confirming deletion', fakeAsync(() => {
    const fixture = TestBed.createComponent(AdminVocabularyComponent);
    const component = fixture.componentInstance;
    const api = TestBed.inject(VocabularyApiService);

    component.vocabularies = [
      { id: 'v1', name: 'Vocabulary One', slug: 'vocabulary-one', type: 'flat', source: 'local' }
    ];

    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    const activeElementSpy = spyOnProperty(document, 'activeElement', 'get').and.returnValue(trigger);
    const focusSpy = spyOn(trigger, 'focus');

    spyOn(api, 'delete').and.resolveTo();
    spyOn(api, 'list').and.resolveTo({ data: [], meta: { total: 0, limit: 25, offset: 0 } });

    component.requestDeleteVocabulary('v1');
    component.confirmDeleteVocabulary();
    flushMicrotasks();
    tick();

    expect(focusSpy).toHaveBeenCalled();

    activeElementSpy.and.callThrough();
    document.body.removeChild(trigger);
  }));

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

  it('shows backend RVA import error details instead of generic HTTP status text', async () => {
    const fixture = TestBed.createComponent(AdminVocabularyComponent);
    const component = fixture.componentInstance;
    const api = TestBed.inject(VocabularyApiService);

    spyOn(api, 'importRva').and.rejectWith({
      message: 'Http failure response for http://localhost:1500/default/rdmp/api/vocabulary/import: 400 Bad Request',
      error: {
        message: 'RVA version 199 has no current concept tree artefact. This vocabulary cannot be imported until RVA publishes a concept tree for that version.'
      }
    });
    spyOn(api, 'list').and.resolveTo({ data: [], meta: { total: 0, limit: 25, offset: 0 } });

    await component.importRva('141');

    expect(component.importStatusVariant).toBe('danger');
    expect(component.error).toContain('has no current concept tree artefact');
    expect(component.error).not.toContain('Http failure response');
  });

  describe('externally managed mirrors', () => {
    it('opens a Figshare mirror read-only so no doomed save is offered', () => {
      const fixture = TestBed.createComponent(AdminVocabularyComponent);
      const component = fixture.componentInstance;

      component.isEditModalOpen = true;
      component.selectedVocabulary = { id: 'v-mirror', name: 'ANZSRC mirror', type: 'tree', source: 'external' };
      component.draft = { ...component.selectedVocabulary, entries: [] };

      expect(component.isSelectedReadOnly).toBeTrue();
      expect(component.canSave).toBeFalse();
      expect(component.canSyncSelected).toBeFalse();
    });

    it('keeps local and RVA vocabularies editable', () => {
      const fixture = TestBed.createComponent(AdminVocabularyComponent);
      const component = fixture.componentInstance;

      component.isEditModalOpen = true;
      component.selectedVocabulary = { id: 'v1', name: 'Local', type: 'flat', source: 'local' };
      component.draft = { ...component.selectedVocabulary, entries: [] };

      expect(component.isSelectedReadOnly).toBeFalse();
      expect(component.canSave).toBeTrue();

      component.selectedVocabulary = { id: 'v2', name: 'RVA', type: 'tree', source: 'rva' };
      component.draft = { ...component.selectedVocabulary, entries: [] };

      expect(component.isSelectedReadOnly).toBeFalse();
      expect(component.canSave).toBeTrue();
    });
  });
});
