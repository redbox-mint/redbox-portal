import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { of } from 'rxjs';
import { parse, getOperationAST } from 'graphql';
import { TranslationService } from '@researchdatabox/portal-ng-common';
import { GraphqlDraftEditorComponent } from './graphql-draft-editor.component';
import { GraphqlJsonInputComponent } from './graphql-json-input.component';

describe('detached GraphQL named-query editor', () => {
  let fixture: ComponentFixture<GraphqlDraftEditorComponent>;
  let editor: GraphqlDraftEditorComponent;
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [GraphqlDraftEditorComponent],
      providers: [
        {
          provide: TranslationService,
          useValue: { t: (key: string) => key, isInitializing: () => false, translationChanges$: of(undefined) },
        },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(GraphqlDraftEditorComponent);
    editor = fixture.componentInstance;
    editor.draft = {
      source: 'graphql',
      name: 'detached',
      graphql: {
        document:
          'query Q($search: String! = "rdmp", $first: Int, $after: String) { records(recordType: $search, first: $first, after: $after) { nodes { oid } hasNextPage } }',
        variables: {},
        resultPath: ['records', 'nodes'],
      },
    };
    fixture.detectChanges();
  });
  it('classifies every variable explicitly and preserves falsy JSON defaults and omissions', () => {
    expect(editor.ownership('search')).toBe('');
    editor.classify('search', 'consumer');
    expect(editor.binding('search')?.inputType).toBe('String!');
    expect(editor.binding('search')?.required).toBeTrue();
    for (const value of [false, 0, '', null, ['a', null]]) {
      editor.setDefault('search', value);
      expect(JSON.stringify(editor.binding('search')?.defaultValue)).toBe(JSON.stringify(value));
    }
    editor.setDefault('search', undefined);
    expect(Object.hasOwn(editor.binding('search')!, 'defaultValue')).toBeFalse();
    editor.classify('search', 'omitted');
    expect(editor.operation.variables['search']?.ownership).toBe('omitted');
    editor.classify('search', 'fixed');
    editor.setFixed('search', { nested: [false, 0] });
    expect(JSON.stringify(editor.fixed('search'))).toBe('{"nested":[false,0]}');
  });
  it('offers candidate values without choosing ownership, then copies only an explicitly fixed value', async () => {
    const candidate = { nested: [false, 0, 'current'] };
    editor.candidateValues = { search: candidate };
    editor.tab = 'variables'; fixture.detectChanges(); await fixture.whenStable();
    expect(editor.ownership('search')).toBe('');
    expect(editor.operation.variables).toEqual({});
    expect(fixture.nativeElement.textContent).toContain('current');
    editor.classify('search', 'consumer');
    expect(Object.hasOwn(editor.binding('search')!, 'defaultValue')).toBeFalse();
    editor.classify('search', 'fixed');
    expect(JSON.stringify(editor.fixed('search'))).toBe(JSON.stringify(candidate));
    expect(editor.fixed('search') === candidate).toBeFalse();
    candidate.nested.push('origin changed');
    expect(JSON.stringify(editor.fixed('search'))).not.toContain('origin changed');
    const value = editor.fixed('search');
    if (value && typeof value === 'object' && !Array.isArray(value) && Array.isArray(value['nested'])) value['nested'].push('fixed changed');
    expect(candidate.nested).not.toContain('fixed changed');
  });
  it('retains pending invalid default text and focus across change detection', async () => {
    editor.classify('search', 'consumer');
    editor.tab = 'variables';
    fixture.detectChanges();
    await fixture.whenStable();
    const json = fixture.debugElement
      .queryAll(By.directive(GraphqlJsonInputComponent))
      .map(node => node.componentInstance as GraphqlJsonInputComponent)
      .find(input => input.optional)!;
    const input = fixture.nativeElement.querySelector('#' + json.id) as HTMLTextAreaElement;
    input.focus();
    input.value = '{invalid';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(json.invalid).toBeTrue();
    expect(input.value).toBe('{invalid');
    expect(document.activeElement).toBe(input);
    editor.draft.description = 'unrelated';
    fixture.detectChanges();
    expect(input.value).toBe('{invalid');
    editor.classify('search', 'fixed');
    fixture.detectChanges();
    expect(editor.fixed('search')).toBeNull();
  });
  it('retains a mounted consumer-default error while a saved paging ownership conflict is repaired', async () => {
    editor.classify('search', 'consumer');
    editor.toggleLookup(true);
    editor.operation.lookup!.firstVariable = 'search';
    editor.tab = 'variables';
    fixture.detectChanges();
    await fixture.whenStable();
    const json = fixture.debugElement
      .queryAll(By.directive(GraphqlJsonInputComponent))
      .map(node => node.componentInstance as GraphqlJsonInputComponent)
      .find(control => control.label === 'named-query-graphql-default')!;
    const input = fixture.nativeElement.querySelector('#' + json.id) as HTMLTextAreaElement;
    const validity = jasmine.createSpy('validity');
    editor.validityChange.subscribe(validity);
    input.value = '{unfinished';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    editor.setDocument(editor.operation.document + ' ');
    fixture.detectChanges();
    expect(input.isConnected).toBeTrue();
    expect(input.value).toBe('{unfinished');
    expect(json.invalid).toBeTrue();
    expect(validity.calls.mostRecent().args[0]).toBeFalse();
  });
  it('removes an optional operation name when the rendered input is cleared for an unnamed query', async () => {
    editor.operation.operationName = 'Q';
    editor.tab = 'document';
    fixture.detectChanges();
    await fixture.whenStable();
    const input = fixture.nativeElement.querySelector('#nq-graphql-operation') as HTMLInputElement;
    editor.operation.document = 'query { records(recordType: "rdmp") { nodes { oid } } }';
    fixture.detectChanges();
    input.value = '';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();
    expect(Object.hasOwn(editor.operation, 'operationName')).toBeFalse();
    expect(Object.hasOwn(JSON.parse(JSON.stringify(editor.draft)).graphql, 'operationName')).toBeFalse();
    expect(getOperationAST(parse(editor.operation.document), editor.operation.operationName)?.name).toBeUndefined();
    expect(editor.variables.length).toBe(0);
  });
  it('makes adapter ownership exclusive only after explicit page selection', () => {
    editor.classify('first', 'consumer');
    editor.toggleLookup(true);
    expect(editor.ownership('first')).toBe('consumer');
    editor.setPageVariable('firstVariable', 'first');
    editor.setPageVariable('afterVariable', 'after');
    expect(editor.ownership('first')).toBe('server');
    expect(Object.hasOwn(editor.operation.variables, 'first')).toBeFalse();
    editor.toggleLookup(false);
    expect(editor.ownership('first')).toBe('');
  });
  it('has labelled panels and roving keyboard tabs', () => {
    const tabs = [...fixture.nativeElement.querySelectorAll('[role="tab"]')] as HTMLButtonElement[];
    tabs[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    fixture.detectChanges();
    expect(editor.tab).toBe('mappings');
    expect(document.activeElement).toBe(tabs[3]);
    const panel = fixture.nativeElement.querySelector('#' + tabs[3].getAttribute('aria-controls'));
    expect(panel.getAttribute('aria-labelledby')).toBe(tabs[3].id);
    expect(panel.hidden).toBeFalse();
    tabs[3].dispatchEvent(new KeyboardEvent('keydown', { key: 'Home', bubbles: true }));
    fixture.detectChanges();
    expect(editor.tab).toBe('basics');
  });
  it('mounts advanced forms on first visit and retains their invalid input after leaving', () => {
    expect(fixture.nativeElement.querySelector('#nq-graphql-panel-mappings textarea')).toBeNull();
    editor.tab = 'mappings';
    fixture.detectChanges();
    const input = fixture.nativeElement.querySelector('#nq-graphql-panel-mappings textarea') as HTMLTextAreaElement;
    input.value = '[unfinished';
    input.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    editor.tab = 'document';
    fixture.detectChanges();
    editor.tab = 'mappings';
    fixture.detectChanges();
    expect(input.isConnected).toBeTrue();
    expect(input.value).toBe('[unfinished');
    expect(input.getAttribute('aria-invalid')).toBe('true');
  });
  it('reuses parsed variables until the document or selected operation changes', () => {
    const variables = editor.variables;
    expect(editor.variables).toBe(variables);
    editor.setDocument('query A($one: String) { a } query B($two: Int) { b }');
    editor.setOperationName('A');
    expect(editor.variables.map(variable => variable.name)).toEqual(['one']);
    editor.setOperationName('B');
    expect(editor.variables.map(variable => variable.name)).toEqual(['two']);
  });
  it('requires literal segment arrays without converting paths or swallowing null values', () => {
    editor.tab = 'mappings';
    fixture.detectChanges();
    const json = fixture.debugElement.query(By.directive(GraphqlJsonInputComponent))
      .componentInstance as GraphqlJsonInputComponent;
    const change = jasmine.createSpy('change');
    json.valueChange.subscribe(change);
    json.path = true;
    json.change('"a.b"');
    expect(json.invalid).toBeTrue();
    expect(change).not.toHaveBeenCalled();
    json.change('["a.b","alias"]');
    expect(change).toHaveBeenCalledWith(['a.b', 'alias']);
    json.path = false;
    json.change('1e1000');
    expect(json.invalid).toBeTrue();
    json.change('null');
    expect(change).toHaveBeenCalledWith(null);
  });

  it('edits result, mapping and lookup paths through JSON controls without splitting literal keys', () => {
    editor.tab = 'mappings';
    editor.toggleLookup(true);
    fixture.detectChanges();
    const controls = fixture.debugElement.queryAll(By.directive(GraphqlJsonInputComponent));
    const change = (label: string, text: string) => {
      const node = controls.find(node => node.componentInstance.label === label)!;
      const input = node.nativeElement.querySelector('textarea') as HTMLTextAreaElement;
      input.value = text;
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    };
    change('named-query-graphql-result-path', '["records","literal.nodes"]');
    change('named-query-graphql-mapping-title', '["metadata","dc:title"]');
    change('named-query-graphql-collectionPath', '["records"]');
    change('named-query-graphql-hasNextPagePath', '["records","more"]');
    change('named-query-graphql-endCursorPath', '["records","cursor"]');
    expect(editor.operation.resultPath).toEqual(['records', 'literal.nodes']);
    expect(editor.operation.mappings!.title).toEqual(['metadata', 'dc:title']);
    expect(editor.operation.lookup!.collectionPath).toEqual(['records']);
    expect(editor.operation.lookup!.hasNextPagePath).toEqual(['records', 'more']);
    expect(editor.operation.lookup!.endCursorPath).toEqual(['records', 'cursor']);
    change('named-query-graphql-mapping-title', '');
    change('named-query-graphql-endCursorPath', '');
    expect(Object.hasOwn(editor.operation.mappings!, 'title')).toBeFalse();
    expect(Object.hasOwn(editor.operation.lookup!, 'endCursorPath')).toBeFalse();
  });

  it('removes stale bindings through their button and recovers validity without clearing unrelated errors', () => {
    editor.operation.variables['removed'] = { ownership: 'fixed', value: false };
    editor.validity('variable:removed:fixed', false);
    editor.validity('mapping:title', false);
    const validity = spyOn(editor.validityChange, 'emit');
    const changed = spyOn(editor.draftChange, 'emit');
    editor.tab = 'variables';
    fixture.detectChanges();
    const button = Array.from(fixture.nativeElement.querySelectorAll('button') as NodeListOf<HTMLButtonElement>)
      .find(node => node.textContent!.includes('named-query-graphql-remove-stale'))!;
    expect(button.parentElement!.textContent).toContain('$removed');
    button.click();
    fixture.detectChanges();
    expect(editor.staleVariables).toEqual([]);
    expect(Object.hasOwn(editor.operation.variables, 'removed')).toBeFalse();
    expect(changed).toHaveBeenCalledOnceWith();
    expect(validity).toHaveBeenCalledWith(false);
    editor.validity('mapping:title', true);
    expect(validity.calls.mostRecent().args).toEqual([true]);
  });

  it('removes only lookup errors when the adapter is disabled', () => {
    editor.toggleLookup(true);
    editor.validity('lookup:collectionPath', false);
    editor.validity('resultPath', false);
    const validity = spyOn(editor.validityChange, 'emit');
    editor.toggleLookup(false);
    expect(editor.operation.lookup).toBeUndefined();
    expect(validity).toHaveBeenCalledWith(false);
    editor.validity('resultPath', true);
    expect(validity.calls.mostRecent().args).toEqual([true]);
  });

  it('drops invalid controls when a document no longer declares their variable', () => {
    editor.classify('search', 'fixed');
    editor.validity('variable:search:fixed', false);
    const validity = spyOn(editor.validityChange, 'emit');
    editor.setDocument('query { records(recordType:"rdmp") { nodes { oid } } }');
    expect(editor.variables).toEqual([]);
    expect(editor.staleVariables).toEqual(['search']);
    expect(validity).toHaveBeenCalledOnceWith(true);
  });

  it('resets advanced editing to the document panel when a replacement draft arrives', () => {
    editor.tab = 'mappings';
    fixture.componentRef.setInput('advanced', true);
    fixture.componentRef.setInput('draft', structuredClone(editor.draft));
    fixture.detectChanges();
    expect(editor.tab).toBe('document');
    expect(fixture.nativeElement.querySelector('#nq-graphql-panel-basics')).toBeNull();
    expect(fixture.nativeElement.querySelector('#nq-graphql-panel-document').hidden).toBeFalse();
    expect(fixture.nativeElement.querySelector('#nq-graphql-panel-mappings textarea')).toBeNull();
  });
});
