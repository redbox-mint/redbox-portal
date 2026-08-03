import { FigshareCrosswalkEditorComponent } from './figshare-crosswalk-editor.component';
import { FigshareCrosswalkMapping } from '../services/figshare-vocabulary-api.service';

describe('FigshareCrosswalkEditorComponent', () => {
  let component: FigshareCrosswalkEditorComponent;

  const mapping: FigshareCrosswalkMapping = {
    id: 'mapping-1',
    revision: 2,
    status: 'approved',
    matchType: 'exact-code',
    localEntryId: 'entry-1',
    localLabel: 'Agricultural biotechnology',
    localValue: '3001',
    figshareCategoryId: 'cat-1',
    figshareSourceId: '3001',
    figshareCategoryNumber: 23815,
    historical: false,
    approvedAt: null,
    approvedBy: null
  };

  beforeEach(() => {
    component = new FigshareCrosswalkEditorComponent();
    component.mappings = [mapping];
  });

  it('opens the picker with no local term when a new mapping is added', () => {
    component.openAddMapping();

    expect(component.picker).toEqual({ localTerm: null });
  });

  it('fixes the local term when another target is added to an existing row', () => {
    component.openAddTarget(mapping);

    expect(component.picker?.localTerm).toEqual({
      id: 'entry-1',
      label: 'Agricultural biotechnology',
      value: '3001'
    });
  });

  it('emits an add change and closes the picker once a target is chosen', () => {
    const emitted: unknown[] = [];
    component.mappingAdded.subscribe((change) => emitted.push(change));
    component.openAddTarget(mapping);

    component.onPickerConfirmed({
      localEntryId: 'entry-1',
      localLabel: '3001 — Agricultural biotechnology',
      figshareCategoryId: 'cat-9',
      targetLabel: '300199 (23848)'
    });

    expect(emitted).toEqual([{ op: 'add', localEntryId: 'entry-1', figshareCategoryId: 'cat-9' }]);
    expect(component.picker).toBeNull();
  });

  it('emits a remove change without touching the picker', () => {
    const emitted: unknown[] = [];
    component.mappingRemoved.subscribe((change) => emitted.push(change));

    component.removeMapping(mapping);

    expect(emitted).toEqual([{ op: 'remove', localEntryId: 'entry-1', figshareCategoryId: 'cat-1' }]);
    expect(component.picker).toBeNull();
  });

  it('discards the picker when it is cancelled', () => {
    component.openAddMapping();

    component.closePicker();

    expect(component.picker).toBeNull();
  });
});
