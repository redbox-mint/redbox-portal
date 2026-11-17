import { formatNamedQuerySort } from './named-query-sections.model';
import { NamedQueryBasicsSectionComponent } from './named-query-basics-section.component';
import { TestBed } from '@angular/core/testing';
import { of } from 'rxjs';
import { TranslationService } from '../translation.service';
import { NamedQueryPreviewSectionComponent } from './named-query-preview-section.component';
import { NamedQueryParametersSectionComponent } from './named-query-parameters-section.component';
import { NamedQueryLookupSectionComponent } from './named-query-lookup-section.component';

describe('Shared named-query sections', () => {
  it('uses one sentence-case sorting summary in both publishing workspaces', () => {
    const labels = { title: 'Title', oid: 'OID' };
    const text = (key: string) => key.endsWith('descending') ? 'Descending' : 'Ascending';
    expect(formatNamedQuerySort([{ field: 'title', direction: 'ASC' }], labels, text)).toBe('Title, ascending');
    expect(formatNamedQuerySort([{ field: 'oid', direction: 'DESC' }], labels, text)).toBe('OID, descending');
    expect(formatNamedQuerySort([null], labels, text)).toBe('');
  });
  it('keeps the short publishing basics and allows the full editor to retain descriptions', async () => {
    TestBed.configureTestingModule({
      imports: [NamedQueryBasicsSectionComponent],
      providers: [
        {
          provide: TranslationService,
          useValue: { translationChanges$: of(), isInitializing: () => false, t: (key: string) => key },
        },
      ],
    });
    const fixture = TestBed.createComponent(NamedQueryBasicsSectionComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('textarea')).toBeNull();
    fixture.componentRef.setInput('showDescription', true);
    fixture.componentRef.setInput('description', 'Existing description');
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    const textarea = fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement;
    expect(textarea.value).toBe('Existing description');
    const edited = spyOn(fixture.componentInstance.descriptionChange, 'emit');
    textarea.value = 'Edited description';
    textarea.dispatchEvent(new Event('input', { bubbles: true }));
    expect(edited).toHaveBeenCalledWith('Edited description');
    fixture.destroy();
  });
  it('retains false, zero and empty saved values and excludes server paging from consumer choices', () => {
    const c = new NamedQueryParametersSectionComponent(),
      changed = jasmine.createSpy();
    c.bindingChange.subscribe(changed);
    for (const value of [false, 0, '']) {
      c.classify({ variable: 'x', label: 'X', inputType: 'String', value, consumerAllowed: true }, 'fixed');
      expect(changed.calls.mostRecent().args[0].binding.value).toBe(value);
    }
    changed.calls.reset();
    c.classify(
      { variable: 'first', label: 'Paging', inputType: 'Int', consumerAllowed: true, paging: true },
      'consumer'
    );
    expect(changed).not.toHaveBeenCalled();
  });
  it('combines page size and cursor into one managed paging row and keeps formatted values separate from bindings', () => {
    const c = new NamedQueryParametersSectionComponent();
    c.rows = [
      { variable: 'first', label: 'Rows per page', inputType: 'Int', value: 25, paging: true, consumerAllowed: false },
      { variable: 'after', label: 'Paging', inputType: 'String', value: null, paging: true, consumerAllowed: false },
      {
        variable: 'sort',
        label: 'Sorting',
        inputType: '[Sort!]',
        value: [{ field: 'title', direction: 'ASC' }],
        displayValue: 'Title, ascending',
        consumerAllowed: false,
      },
    ];
    expect(c.visibleRows.length).toBe(2);
    expect<unknown>(c.visibleRows[0].value).toBe(25);
    expect(c.displayValue(c.rows[2])).toBe('Title, ascending');
    expect<unknown>(c.rows[2].value).toEqual([{ field: 'title', direction: 'ASC' }]);
  });
  it('keeps nested input objects fixed and creates scalar consumer bindings explicitly', () => {
    const c = new NamedQueryParametersSectionComponent(),
      changed = jasmine.createSpy();
    c.bindingChange.subscribe(changed);
    c.classify(
      { variable: 'filters', label: 'Conditions', inputType: '[RecordFilterInput!]', consumerAllowed: false },
      'consumer'
    );
    expect(changed).not.toHaveBeenCalled();
    c.classify(
      { variable: 'search', label: 'Title contains', inputType: 'String!', value: 'heat', consumerAllowed: true },
      'consumer'
    );
    expect(changed).toHaveBeenCalledOnceWith({
      variable: 'search',
      binding: { ownership: 'consumer', parameter: 'search', inputType: 'String!', required: true },
    });
  });
  it('keeps mapping edits detached, uses literal paths and rejects invalid or unsafe raw paths', () => {
    const c = new NamedQueryLookupSectionComponent(),
      changed = jasmine.createSpy(),
      validity = jasmine.createSpy();
    c.mappings = { oid: ['oid'] };
    c.mappingsChange.subscribe(changed);
    c.validityChange.subscribe(validity);
    c.select('title', JSON.stringify(['metadata', 'literal.dot']));
    expect(c.mappings).toEqual({ oid: ['oid'] });
    expect(changed).toHaveBeenCalledWith({ oid: ['oid'], title: ['metadata', 'literal.dot'] });
    changed.calls.reset();
    c.setRaw('{');
    expect(c.rawMappings).toBe('{');
    expect(validity).toHaveBeenCalledWith(false);
    expect(changed).not.toHaveBeenCalled();
    c.setRaw('{"oid":["constructor"]}');
    expect(changed).not.toHaveBeenCalled();
    c.setRaw('{"oid":["id"]}');
    expect(changed).toHaveBeenCalledWith({ oid: ['id'] });
  });
});

describe('Shared preview focus', () => {
  it('keeps keyboard focus on Run preview while busy and prevents a duplicate run', async () => {
    await TestBed.configureTestingModule({
      imports: [NamedQueryPreviewSectionComponent],
      providers: [
        {
          provide: TranslationService,
          useValue: { t: (key: string) => key, translationChanges$: of(undefined), isInitializing: () => false },
        },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(NamedQueryPreviewSectionComponent);
    fixture.detectChanges();
    const button = fixture.nativeElement.querySelector('button') as HTMLButtonElement;
    const run = jasmine.createSpy();
    fixture.componentInstance.run.subscribe(run);
    button.focus();
    button.click();
    fixture.componentRef.setInput('busy', true);
    fixture.detectChanges();
    expect(document.activeElement).toBe(button);
    expect(button.getAttribute('aria-disabled')).toBe('true');
    button.click();
    expect(run).toHaveBeenCalledTimes(1);
    fixture.componentRef.setInput('busy', false);
    fixture.detectChanges();
    expect(document.activeElement).toBe(button);
    fixture.destroy();
  });
});
