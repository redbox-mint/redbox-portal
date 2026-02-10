import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Pipe, PipeTransform } from '@angular/core';
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
      declarations: [VocabListComponent, I18NextPipeStub]
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
