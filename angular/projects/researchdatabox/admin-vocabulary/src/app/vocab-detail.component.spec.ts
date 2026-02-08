import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { VocabDetailComponent } from './vocab-detail.component';

describe('VocabDetailComponent', () => {
  let fixture: ComponentFixture<VocabDetailComponent>;
  let component: VocabDetailComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [VocabDetailComponent],
      imports: [FormsModule]
    }).compileComponents();

    fixture = TestBed.createComponent(VocabDetailComponent);
    component = fixture.componentInstance;
  });

  it('adds entries and maintains manual order updates', () => {
    component.addEntry();
    component.addEntry();
    component.draft.entries![0].label = 'One';
    component.draft.entries![1].label = 'Two';

    component.moveEntryDown(0);
    expect(component.draft.entries![0].label).toBe('Two');
    expect(component.draft.entries![0].order).toBe(0);
    expect(component.draft.entries![1].order).toBe(1);

    component.moveEntryUp(1);
    expect(component.draft.entries![0].label).toBe('One');
  });
});
