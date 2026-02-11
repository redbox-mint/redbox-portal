import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Pipe, PipeTransform } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { VocabDetailComponent } from './vocab-detail.component';

@Pipe({ name: 'i18next', standalone: false })
class I18NextPipeStub implements PipeTransform {
  transform(value: string): string {
    return value;
  }
}

describe('VocabDetailComponent', () => {
  let fixture: ComponentFixture<VocabDetailComponent>;
  let component: VocabDetailComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [VocabDetailComponent, I18NextPipeStub],
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

  it('provides valid parent options that exclude self and descendants', () => {
    component.draft.type = 'tree';
    component.draft.entries = [
      { id: 'a', label: 'A', value: 'A', parent: undefined },
      { id: 'b', label: 'B', value: 'B', parent: 'a' },
      { id: 'c', label: 'C', value: 'C', parent: 'b' },
      { id: 'd', label: 'D', value: 'D', parent: undefined }
    ];

    const optionsForB = component.getParentOptions(component.draft.entries[1]);
    const optionIdsForB = optionsForB.map(option => option.id);
    expect(optionIdsForB).toEqual(['a', 'd']);
  });

  it('creates temporary ids for new entries so they can be used as parents', () => {
    component.draft.type = 'tree';
    component.draft.entries = [];

    component.addEntry();
    component.addEntry();

    const first = component.draft.entries![0];
    const second = component.draft.entries![1];
    second.parent = first.id;

    expect(first.id).toContain('tmp-');
    expect(second.parent).toBe(first.id);
    const optionsForSecond = component.getParentOptions(second);
    expect(optionsForSecond.some(option => option.id === first.id)).toBeTrue();
  });

  it('defaults new entries to non-historical', () => {
    component.addEntry();

    expect(component.draft.entries![0].historical).toBeFalse();
  });

  it('tracks parent editor state per entry', () => {
    component.draft.type = 'tree';
    component.draft.entries = [
      { id: 'a', label: 'A', value: 'A' },
      { id: 'b', label: 'B', value: 'B' }
    ];

    component.openParentEditor(component.draft.entries[0]);
    expect(component.isParentEditorOpen(component.draft.entries[0])).toBeTrue();
    expect(component.isParentEditorOpen(component.draft.entries[1])).toBeFalse();

    component.closeParentEditor();
    expect(component.isParentEditorOpen(component.draft.entries[0])).toBeFalse();
  });

  it('builds hierarchy preview from parent relationships', () => {
    component.draft.type = 'tree';
    component.draft.entries = [
      { id: 'a', label: 'Root', value: '1', parent: undefined, order: 0 },
      { id: 'b', label: 'Child', value: '2', parent: 'a', order: 1 },
      { id: 'c', label: 'Sibling root', value: '3', parent: undefined, order: 2 }
    ];

    component.toggleTreePreview();

    expect(component.isTreePreviewVisible).toBeTrue();
    expect(component.previewTree.length).toBe(2);
    expect(component.previewTree[0].id).toBe('a');
    expect(component.previewTree[0].children[0].id).toBe('b');
    expect(component.previewTree[1].id).toBe('c');
  });

  it('supports collapsing and expanding preview branches', () => {
    component.draft.type = 'tree';
    component.draft.entries = [
      { id: 'a', label: 'Root', value: '1', parent: undefined, order: 0 },
      { id: 'b', label: 'Child', value: '2', parent: 'a', order: 1 }
    ];

    component.toggleTreePreview();

    const root = component.previewTree[0];
    expect(component.hasPreviewChildren(root)).toBeTrue();
    expect(component.isPreviewNodeCollapsed(root)).toBeFalse();

    component.togglePreviewNode(root);
    expect(component.isPreviewNodeCollapsed(root)).toBeTrue();

    component.togglePreviewNode(root);
    expect(component.isPreviewNodeCollapsed(root)).toBeFalse();
  });
});
