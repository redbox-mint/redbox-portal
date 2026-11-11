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
  it('requires literal segment arrays without converting paths or swallowing null values', () => {
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
});
