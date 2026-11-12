import { of } from 'rxjs';
import { fakeAsync, tick, TestBed } from '@angular/core/testing';
import { TranslationService } from '@researchdatabox/portal-ng-common';
import { ColumnsPanelComponent } from './columns-panel.component';
import { scope } from './data-grid.testing';

describe('Explorer columns panel', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ColumnsPanelComponent],
      providers: [
        {
          provide: TranslationService,
          useValue: { t: (key: string) => key, translationChanges$: of(undefined), isInitializing: () => false },
        },
      ],
    }).compileComponents();
  });
  it('reorders with arrows, Home and End without changing the caller selection; Cancel discards edits', async () => {
    const fixture = TestBed.createComponent(ColumnsPanelComponent),
      component = fixture.componentInstance;
    const selected = ['title', 'budget', 'start'];
    fixture.componentRef.setInput('fields', scope.fields);
    fixture.componentRef.setInput('selected', selected);
    fixture.detectChanges();
    const closed = jasmine.createSpy();
    component.closed.subscribe(closed);
    const event = new KeyboardEvent('keydown', { key: 'ArrowRight', cancelable: true });
    component.reorder(event, 0);
    expect(event.defaultPrevented).toBeTrue();
    expect(component.columns).toEqual(['budget', 'title', 'start']);
    component.reorder(new KeyboardEvent('keydown', { key: 'End' }), 1);
    expect(component.columns).toEqual(['budget', 'start', 'title']);
    component.reorder(new KeyboardEvent('keydown', { key: 'Home' }), 2);
    expect(component.columns).toEqual(['title', 'budget', 'start']);
    component.reorder(new KeyboardEvent('keydown', { key: 'ArrowLeft' }), 0);
    expect(component.columns).toEqual(['title', 'budget', 'start']);
    component.toggle('budget');
    component.closed.emit();
    expect(selected).toEqual(['title', 'budget', 'start']);
    expect(closed).toHaveBeenCalled();
    fixture.destroy();
  });
  it('groups fields, searches paths and hides repeating children behind a single disclosure', () => {
    const fixture = TestBed.createComponent(ColumnsPanelComponent),
      c = fixture.componentInstance;
    fixture.componentRef.setInput('fields', [
      { ...scope.fields[0], groupPath: ['Project'] },
      { ...scope.fields[1], path: '/budget', groupPath: ['Project', 'Funding'] },
      { ...scope.fields[5], repeatingSubfield: true, groupPath: ['People'] },
    ]);
    fixture.detectChanges();
    expect(c.groups.map(g => g.label)).toEqual(['Project', 'Project / Funding']);
    expect(c.repeatingCount).toBe(1);
    c.search = '/budget';
    expect(c.groups[0].fields.map(f => f.id)).toEqual(['budget']);
    c.search = '';
    c.showRepeating = true;
    expect(c.groups.some(g => g.label === 'People')).toBeTrue();
    fixture.destroy();
  });
  it('supports pointer drop, retains opaque IDs and emits the chosen order only on Apply', () => {
    const fixture = TestBed.createComponent(ColumnsPanelComponent),
      c = fixture.componentInstance;
    fixture.componentRef.setInput('fields', scope.fields);
    fixture.componentRef.setInput('selected', ['title', 'budget']);
    fixture.detectChanges();
    const applied = jasmine.createSpy();
    c.applied.subscribe(applied);
    c.dragIndex = 0;
    c.drop(new DragEvent('drop', { cancelable: true }), 1);
    expect(c.columns).toEqual(['budget', 'title']);
    expect(applied).not.toHaveBeenCalled();
    c.applied.emit(c.columns);
    expect(applied).toHaveBeenCalledWith(['budget', 'title']);
    fixture.destroy();
  });
  it('keeps keyboard focus in the panel after removing first, last and final chips', fakeAsync(() => {
    const fixture = TestBed.createComponent(ColumnsPanelComponent);
    fixture.componentRef.setInput('fields', scope.fields);
    fixture.componentRef.setInput('selected', ['title', 'budget', 'start']);
    fixture.detectChanges(); tick();
    for (const [id, next] of [['title', 'budget'], ['start', 'budget'], ['budget', null]]) {
      const remove = fixture.nativeElement.querySelector(
        `[data-column-id="${id}"] + button`
      ) as HTMLButtonElement;
      remove.focus(); remove.click(); fixture.detectChanges(); tick();
      const expected = fixture.nativeElement.querySelector(next ? `[data-column-id="${next}"]` : '#field-search');
      expect(document.activeElement).toBe(expected);
      expect(fixture.nativeElement.querySelector('[role="dialog"]').contains(document.activeElement)).toBeTrue();
    }
    fixture.destroy();
  }));

  it('leaves ungrouped fields flat and uses the shared record ID label', () => {
    const fixture = TestBed.createComponent(ColumnsPanelComponent), c = fixture.componentInstance;
    fixture.componentRef.setInput('fields', [
      { id: 'record:oid', label: 'OID', type: 'text', selectable: true },
      { id: 'title', label: 'Title', type: 'text', selectable: true },
      { id: 'legacy', label: 'Legacy', type: 'text', selectable: true, groupPath: ['Metadata'] },
      { id: 'person', label: 'Person', type: 'text', selectable: true, groupPath: ['People'] },
    ]);
    fixture.detectChanges();
    expect(c.groups.map(g => g.label)).toEqual(['data-grids-field-group-record', '', 'People']);
    expect(c.label('record:oid')).toBe('data-grids-oid');
    const flat = fixture.nativeElement.querySelector('.explorer-field-flat');
    expect(flat.textContent).toContain('Title');
    expect(flat.querySelector('summary')).toBeNull();
    expect(fixture.nativeElement.textContent).not.toContain('Metadata');
    fixture.destroy();
  });

});
