import { ComponentFixture, TestBed } from '@angular/core/testing';
import { VocabListComponent } from './vocab-list.component';

describe('VocabListComponent', () => {
  let fixture: ComponentFixture<VocabListComponent>;
  let component: VocabListComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [VocabListComponent]
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
});
