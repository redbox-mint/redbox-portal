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
    await component.importRva('rva:test');
    expect(component.error).toBe('');
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
