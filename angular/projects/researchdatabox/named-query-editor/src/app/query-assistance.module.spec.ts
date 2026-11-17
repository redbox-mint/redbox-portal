import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { AutocompleteComponent, TranslationService } from '@researchdatabox/portal-ng-common';
import { of } from 'rxjs';
import { QueryAssistanceModule, QueryDiagnosticsComponent, QueryPathInputComponent, QueryTypedValueComponent } from './query-assistance.module';

describe('Named query typed parameter inputs', () => {
  let fixture: ComponentFixture<QueryTypedValueComponent>;
  let component: QueryTypedValueComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [QueryAssistanceModule],
      providers: [{
        provide: TranslationService,
        useValue: { t: (key: string) => key, isInitializing: () => false, translationChanges$: of(undefined) },
      }],
    }).compileComponents();
    fixture = TestBed.createComponent(QueryTypedValueComponent);
    component = fixture.componentInstance;
  });

  for (const type of ['object', 'array', 'number', 'boolean', 'date']) {
    it(`passes ${type} template input unchanged for server-side transformation before coercion`, async () => {
      fixture.componentRef.setInput('type', type);
      fixture.componentRef.setInput('template', type === 'object' ? '{"name":"{{value}}"}' : '{{value}}');
      fixture.componentRef.setInput('format', 'days');
      fixture.componentRef.setInput('queryType', '>=');
      const emitted = spyOn(component.valueChange, 'emit');
      fixture.detectChanges();
      await fixture.whenStable();
      expect(emitted).not.toHaveBeenCalled();
      const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
      expect(input.type).toBe('text');
      const rawInput = type === 'boolean' ? 'false' : 'Alice';
      input.value = rawInput;
      input.dispatchEvent(new Event('input'));
      await fixture.whenStable();
      expect(emitted).toHaveBeenCalledWith(rawInput);
      expect(component.error).toBeFalse();
    });
  }

  it('only offers numeric day offsets with a date operator and passes ISO dates through', async () => {
    fixture.componentRef.setInput('type', 'date');
    fixture.componentRef.setInput('format', 'days');
    fixture.componentRef.setInput('value', '2016-10-25T12:30:51.151+10:00');
    const emitted = spyOn(component.valueChange, 'emit');
    fixture.detectChanges();
    await fixture.whenStable();
    let input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    expect(input.type).toBe('text');
    expect(input.value).toBe('2016-10-25T12:30:51.151+10:00');
    expect(emitted).not.toHaveBeenCalled();
    fixture.componentRef.setInput('queryType', '>=');
    fixture.componentRef.setInput('value', -7);
    fixture.detectChanges();
    await fixture.whenStable();
    input = fixture.nativeElement.querySelector('input');
    expect(input.type).toBe('number');
    input.value = '-3';
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(emitted).toHaveBeenCalledWith('-3');
    fixture.componentRef.setInput('format', 'ISODate');
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('input').type).toBe('text');
  });

  it('emits recovered validity after the parameter type changes', () => {
    fixture.componentRef.setInput('type', 'object');
    fixture.detectChanges();
    fixture.debugElement.query(By.css('textarea')).triggerEventHandler('ngModelChange', '{ unfinished');
    const validity = spyOn(component.validityChange, 'emit');
    fixture.componentRef.setInput('type', 'string');
    fixture.detectChanges();
    expect(validity).toHaveBeenCalledWith(true);
    expect(component.error).toBeFalse();
    expect(fixture.nativeElement.querySelector('textarea')).toBeNull();
  });

  it('retains invalid default text when only its accessible label changes', () => {
    fixture.componentRef.setInput('type', 'object');
    fixture.detectChanges();
    fixture.debugElement.query(By.css('textarea')).triggerEventHandler('ngModelChange', '{ unfinished');
    const validity = spyOn(component.validityChange, 'emit');
    fixture.componentRef.setInput('label', 'Default value: renamed');
    fixture.detectChanges();
    expect(component.jsonValue).toBe('{ unfinished');
    expect(component.error).toBeTrue();
    expect(validity).not.toHaveBeenCalled();
  });

  it('explicitly unsets invalid JSON and reports recovered validity', () => {
    fixture.componentRef.setInput('type', 'object');
    fixture.detectChanges();
    fixture.debugElement.query(By.css('textarea')).triggerEventHandler('ngModelChange', '{ unfinished');
    const validity = spyOn(component.validityChange, 'emit');
    const emitted = spyOn(component.valueChange, 'emit');
    fixture.nativeElement.querySelector('.nq-unset-value').click();
    fixture.detectChanges();
    expect(validity).toHaveBeenCalledWith(true);
    expect(emitted).toHaveBeenCalledWith(undefined);
    expect(component.jsonValue).toBe('');
    expect(component.error).toBeFalse();
  });

  it('preserves cleared numeric text for server-side coercion', async () => {
    fixture.componentRef.setInput('type', 'number');
    fixture.componentRef.setInput('value', 4);
    fixture.detectChanges(); await fixture.whenStable();
    const emitted = spyOn(component.valueChange, 'emit');
    const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
    expect(input.type).toBe('number');
    input.value = ''; input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    expect(emitted).toHaveBeenCalledOnceWith('');
  });

  it('starts an optional object empty and emits undefined when its JSON text is cleared', async () => {
    fixture.componentRef.setInput('type', 'object');
    fixture.detectChanges(); await fixture.whenStable();
    expect(fixture.nativeElement.querySelector('textarea').value).toBe('');
    const emitted = spyOn(component.valueChange, 'emit');
    const validity = spyOn(component.validityChange, 'emit');
    component.changeJson(''); fixture.detectChanges();
    expect(emitted).toHaveBeenCalledOnceWith(undefined);
    expect(validity).toHaveBeenCalledOnceWith(true);
    expect(fixture.nativeElement.querySelector('[role="alert"]')).toBeNull();
  });
});

describe('Named query diagnostic explanations', () => {
  it('translates GraphQL codes, falls back to server explanations and filters complete location segments', async () => {
    const messages: Record<string, string> = {
      'nq-ux-diagnostic-REQUIRED_VARIABLE': 'Choose a saved value or caller parameter for each required condition.',
      'nq-ux-diagnostic-GRAPHQL_SYNTAX': 'Check the GraphQL syntax at the indicated line and column.',
      'nq-ux-diagnostic-LOOKUP_MAPPING': 'Choose a stored value and label that are present in every suggestion.',
    };
    const translate = jasmine.createSpy('translate').and.callFake((key: string, fallback?: string | Record<string, unknown>) => {
      if (key === 'named-query-diagnostic-location' && fallback && typeof fallback === 'object')
        return `Line ${fallback['line']}, column ${fallback['column']}`;
      return messages[key] ?? (typeof fallback === 'string' ? fallback : key);
    });
    await TestBed.configureTestingModule({
      imports: [QueryAssistanceModule],
      providers: [{ provide: TranslationService, useValue: {
        t: translate, isInitializing: () => false, translationChanges$: of(undefined),
      } }],
    }).compileComponents();
    const fixture = TestBed.createComponent(QueryDiagnosticsComponent);
    const diagnostic = (code: string, field: string, reason: string) => ({ code, field, reason, severity: 'error' as const, line: 0, column: 0 });
    fixture.componentRef.setInput('diagnostics', [
      diagnostic('REQUIRED_VARIABLE', 'graphql.variables', 'Technical required error'),
      diagnostic('GRAPHQL_SYNTAX', 'graphql.document', 'Technical syntax error'),
      { ...diagnostic('LOOKUP_MAPPING', 'graphql.mappings.title', 'Technical mapping error'), severity: 'warning', line: 2, column: 4, suggestion: '["title"]' },
      diagnostic('NEW_CODE', 'graphql.variables.term', 'A new server explanation.'),
      diagnostic('INVALID_DEFAULT', 'queryParams.term', 'Database parameter needs a number.'),
      diagnostic('REQUIRED_VARIABLE', 'graphql.variablesExtra', 'Separate location'),
    ]);
    fixture.detectChanges();
    let text = fixture.nativeElement.textContent;
    for (const message of Object.values(messages)) expect(text).toContain(message);
    expect(text).toContain('A new server explanation.');
    expect(text).toContain('Database parameter needs a number.');
    expect(text).not.toContain('Technical ');
    const warning = fixture.nativeElement.querySelector('.rb-ws-diagnostic-warning');
    expect(warning.textContent).toContain('Line 2, column 4');
    expect(warning.textContent).toContain('["title"]');
    expect(translate).toHaveBeenCalledWith('nq-ux-diagnostic-NEW_CODE', 'A new server explanation.');
    fixture.componentRef.setInput('location', 'graphql.variables'); fixture.detectChanges();
    const locations = Array.from(fixture.nativeElement.querySelectorAll('[data-location]') as NodeListOf<HTMLElement>)
      .map(node => node.getAttribute('data-location'));
    expect(locations).toEqual(['graphql.variables', 'graphql.variables.term']);
    text = fixture.nativeElement.textContent;
    expect(text).toContain(messages['nq-ux-diagnostic-REQUIRED_VARIABLE']);
    expect(text).toContain('A new server explanation.');
    expect(text).not.toContain('Separate location');
    fixture.destroy();
  });
});

describe('Named query direct mapping path completion', () => {
  for (const [literal, prefix] of [
    ['literal.alias', ''],
    ['dc:title', '[dc:'],
  ]) {
    it(`matches and inserts the literal ${literal} key in lodash syntax`, async () => {
      await TestBed.configureTestingModule({
        imports: [QueryAssistanceModule],
        providers: [
          {
            provide: TranslationService,
            useValue: { t: (key: string) => key, isInitializing: () => false, translationChanges$: of(undefined) },
          },
        ],
      }).compileComponents();
      const fixture = TestBed.createComponent(QueryPathInputComponent);
      fixture.componentRef.setInput('kind', 'mapping');
      fixture.componentRef.setInput('fields', [
        {
          path: `record.metadata.[${literal}]`,
          type: 'string',
          required: false,
          isArray: false,
        },
      ]);
      fixture.componentRef.setInput('value', 'record.metadata.' + prefix);
      fixture.detectChanges();
      await fixture.whenStable();
      const input = fixture.nativeElement.querySelector('input') as HTMLInputElement;
      input.setSelectionRange(input.value.length, input.value.length);
      const autocomplete = fixture.debugElement.query(By.directive(AutocompleteComponent))
        .componentInstance as AutocompleteComponent;
      const emitted = spyOn(fixture.componentInstance.valueChange, 'emit');
      autocomplete.update(true);
      expect(autocomplete.items.length).toBe(1);
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', cancelable: true }));
      expect(input.value).toBe(`record.metadata["${literal}"]`);
      expect(emitted).toHaveBeenCalledWith(`record.metadata["${literal}"]`);
      fixture.destroy();
    });
  }
});
