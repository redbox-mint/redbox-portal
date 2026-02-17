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
      imports: [FormsModule]
    }).compileComponents();

    fixture = TestBed.createComponent(VocabListComponent);
    component = fixture.componentInstance;
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
});
