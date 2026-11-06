import { getStubTranslationService, AdminListFooterComponent } from '@researchdatabox/portal-ng-common';
import { TranslationService } from '@researchdatabox/portal-ng-common';
import { AdminCountPipe } from '@researchdatabox/portal-ng-common';
import { AdminDateService } from '@researchdatabox/portal-ng-common';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Pipe, PipeTransform } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { VocabListComponent } from './vocab-list.component';

@Pipe({ name: 'i18next', standalone: false })
class I18NextPipeStub implements PipeTransform {
  transform(value: string): string {
    return value;
  }
}

describe('VocabListComponent', () => {
  let fixture: ComponentFixture<VocabListComponent>;
  let component: VocabListComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [VocabListComponent, I18NextPipeStub],
      imports: [AdminListFooterComponent, AdminCountPipe, FormsModule],
      providers: [{ provide: TranslationService, useValue: getStubTranslationService() }, { provide: AdminDateService, useValue: { format: (value: string) => 'formatted:' + value } }]
    }).compileComponents();

    fixture = TestBed.createComponent(VocabListComponent);
    component = fixture.componentInstance;
  });

  it('clears all filters together and cancels a pending search update', () => {
    const changed = spyOn(component.queryChanged, 'emit');
    component.sourceFilter = 'rva';
    component.typeFilter = 'tree';
    component.onSearchTermChanged('pending');
    component.clearFilters();
    expect(changed).toHaveBeenCalledOnceWith({ searchTerm: '', sourceFilter: 'all', typeFilter: 'all' });
  });

  it('shows last successful RVA sync, Never when unsynced and a dash for local lists', () => {
    component.vocabularies = [
      { id: 'local', name: 'Local', slug: 'local', type: 'flat', source: 'local', lastSyncedAt: 'ignored' },
      { id: 'rva', name: 'RVA', slug: 'rva', type: 'tree', source: 'rva', lastSyncedAt: '2026-11-06T00:00:00Z' },
      { id: 'new', name: 'New', slug: 'new', type: 'tree', source: 'rva' },
    ];
    fixture.detectChanges();
    const cells = Array.from(fixture.nativeElement.querySelectorAll('tbody tr')).map((row: any) => row.querySelectorAll('td')[3].textContent.trim());
    expect(cells).toEqual(['—', 'formatted:2026-11-06T00:00:00Z', 'admin-vocabulary-never-synced']);
  });

  it('emits selected and delete actions', () => {
    let selectedId = '';
    let deletedId = '';
    component.selected.subscribe((id: string) => selectedId = id);
    component.deleted.subscribe((id: string) => deletedId = id);

    component.open('v1');
    component.remove('v2');

    expect(selectedId).toBe('v1');
    expect(deletedId).toBe('v2');
  });

  it('emits query changes for filter updates', () => {
    let query: unknown;
    component.queryChanged.subscribe((value) => query = value);

    component.setSourceFilter('rva');

    expect(query).toEqual({
      searchTerm: '',
      sourceFilter: 'rva',
      typeFilter: 'all'
    });
  });

  it('emits page change for next page', () => {
    let offset = -1;
    component.totalCount = 100;
    component.pageSize = 25;
    component.offset = 0;
    component.pageChanged.subscribe((value) => offset = value);

    component.nextPage();

    expect(offset).toBe(25);
  });

  it('treats externally mirrored vocabularies as read only', () => {
    expect(component.isReadOnly({ source: 'external' } as any)).toBe(true);
    expect(component.isReadOnly({ source: 'local' } as any)).toBe(false);
    expect(component.isReadOnly({ source: 'rva' } as any)).toBe(false);
  });

  it('disables delete and offers view instead of edit for a mirrored vocabulary', () => {
    component.vocabularies = [
      { id: 'v1', name: 'Local', slug: 'local', type: 'flat', source: 'local' },
      { id: 'v2', name: 'Mirror', slug: 'mirror', type: 'tree', source: 'external' }
    ] as any;
    component.totalCount = 2;
    fixture.detectChanges();

    const rows = fixture.nativeElement.querySelectorAll('tbody tr');
    const localButtons = rows[0].querySelectorAll('td:last-child button');
    const mirrorButtons = rows[1].querySelectorAll('td:last-child button');

    expect(localButtons[0].textContent.trim()).toBe('admin-vocabulary-edit');
    expect(localButtons[2].disabled).toBe(false);

    expect(mirrorButtons[0].textContent.trim()).toBe('admin-vocabulary-view');
    expect(mirrorButtons[2].disabled).toBe(true);
    expect(rows[1].textContent).toContain('admin-vocabulary-read-only');
  });
});
