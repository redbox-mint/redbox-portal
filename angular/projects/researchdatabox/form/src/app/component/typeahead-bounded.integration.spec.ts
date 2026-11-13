import i18next from 'i18next';
import { NoopAnimationsModule } from '@angular/platform-browser/animations';
import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TypeaheadDirective, TypeaheadModule } from 'ngx-bootstrap/typeahead';
import {
  EditorDiagnostic,
  FormConfigFrame,
  NamedQueryLookupResult,
  TypeaheadInputFieldComponentConfig,
  TypeaheadOption,
  TypeaheadSourceType,
} from '@researchdatabox/sails-ng-common';
import { createFormAndWaitForReady, createTestbedModule } from '../helpers.spec';
import { TypeaheadDataService, TypeaheadLookupError } from '../service/typeahead-data.service';
import { TypeaheadInputComponent } from './typeahead-input.component';

/** Exercises the actual ngx-bootstrap focus/input/min-length/options gates. */
describe('bounded lookup input integration', () => {
  const settle = () => new Promise(resolve => setTimeout(resolve, 25));
  beforeEach(async () => {
    const { translationService } = await createTestbedModule({
      declarations: { TypeaheadInputComponent },
      imports: { TypeaheadModule: TypeaheadModule.forRoot(), NoopAnimationsModule },
    });
    if (!i18next.isInitialized) await i18next.init({ lng: 'en', resources: { en: { translation: {} } } });
    i18next.addResourceBundle(
      'en',
      'translation',
      { '@form-typeahead-refine-search': 'Refine your search' },
      true,
      true
    );
    translationService.t = (key: string) => (key === '@form-typeahead-refine-search' ? 'Refine your search' : key);
  });
  async function render(
    minChars?: number,
    maxResults = 25,
    lookupDiagnostics?: EditorDiagnostic[],
    sourceType: TypeaheadSourceType = 'namedQuery',
    sourceOverrides: Partial<TypeaheadInputFieldComponentConfig> = {}
  ) {
    const source =
      sourceType === 'namedQuery'
        ? { sourceType, queryId: 'party' }
        : sourceType === 'static'
          ? { sourceType, staticOptions: [{ label: 'Default choice', value: 'default' }] }
          : sourceType === 'vocabulary'
            ? { sourceType, vocabRef: 'party' }
            : sourceType === 'service'
              ? { sourceType, serviceId: 'party' }
              : { sourceType, provider: 'party' };
    const config: FormConfigFrame = {
      name: 'bounded',
      componentDefinitions: [
        {
          name: 'lookup',
          component: {
            class: 'TypeaheadInputComponent',
            config: {
              ...source,
              ...sourceOverrides,
              ...(minChars === undefined ? {} : { minChars }),
              maxResults,
              debounceMs: 0,
              cacheResults: sourceType === 'namedQuery',
              lookupDiagnostics,
            },
          },
          model: { class: 'TypeaheadInputModel', config: {} },
        },
      ],
    };
    const { fixture } = await createFormAndWaitForReady(config);
    const field = fixture.debugElement.query(By.directive(TypeaheadInputComponent));
    const component = field.componentInstance as TypeaheadInputComponent;
    const input = field.query(By.css('input')).nativeElement as HTMLInputElement;
    const directive = field.query(By.directive(TypeaheadDirective)).injector.get(TypeaheadDirective);
    async function type(value: string) {
      input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      fixture.detectChanges();
      await settle();
      fixture.detectChanges();
    }
    return { fixture, component, input, directive, type };
  }
  const page = (label: string, more = false, count = 1): NamedQueryLookupResult<TypeaheadOption> => ({
    source: 'graphql',
    options: Array.from({ length: count }, (_, i) => ({ label: `${label} ${i}`, value: `${label}-${i}` })),
    summary: { numFound: null, start: 0, page: 1 },
    pagination: { mode: 'firstPage', hasNextPage: more },
  });
  for (const minChars of [0, 1, undefined]) {
    it(`honors minChars ${minChars ?? 'default'} and never searches empty input/focus`, async () => {
      const search = spyOn(TestBed.inject(TypeaheadDataService), 'searchNamedQueryLookup').and.resolveTo(page('a'));
      const view = await render(minChars);
      expect(view.directive.typeaheadMinLength).toBe(minChars ?? 2);
      view.input.dispatchEvent(new Event('focus'));
      await settle();
      expect(search).not.toHaveBeenCalled();
      await view.type('a');
      if (minChars === undefined) expect(search).not.toHaveBeenCalled();
      else {
        expect(search).toHaveBeenCalled();
        expect(search.calls.allArgs().every(args => args[1] === 'a')).toBeTrue();
      }
      await view.type('ab');
      expect(search.calls.mostRecent().args[1]).toBe('ab');
      const callsBeforeClearing = search.calls.count();
      await view.type('');
      await view.type('   ');
      expect(search.calls.count()).toBe(callsBeforeClearing);
      expect(view.component.searchState).toBe('idle');
      expect(view.component.hasNextPage).toBeFalse();
      expect(view.directive.isOpen).toBeFalse();
    });
  }
  for (const source of ['static', 'vocabulary', 'service', 'external'] as const) {
    it(`retains ${source} empty focus/input options when minChars is zero`, async () => {
      const methods = {
        static: 'searchStatic',
        vocabulary: 'searchVocabularyEntries',
        service: 'searchService',
        external: 'searchExternal',
      } as const;
      const search = spyOn(TestBed.inject(TypeaheadDataService), methods[source]).and.resolveTo([
        { label: 'Default choice', value: 'default' },
      ]);
      const view = await render(0, 25, undefined, source);
      view.input.dispatchEvent(new Event('focus'));
      await settle();
      view.fixture.detectChanges();
      expect(search).toHaveBeenCalled();
      expect(search.calls.mostRecent().args[source === 'static' ? 0 : 1]).toBe('');
      expect(view.directive.isOpen).toBeTrue();
      expect(view.input.getAttribute('aria-expanded')).toBe('true');
      expect(view.fixture.nativeElement.querySelector('typeahead-container')?.textContent).toContain('Default choice');
      await view.type('match');
      const callsBeforeClearing = search.calls.count();
      await view.type('');
      expect(search.calls.count()).toBeGreaterThan(callsBeforeClearing);
      expect(search.calls.mostRecent().args[source === 'static' ? 0 : 1]).toBe('');
      expect(view.directive.isOpen).toBeTrue();
      expect(view.input.getAttribute('aria-expanded')).toBe('true');
      expect(view.fixture.nativeElement.querySelector('typeahead-container')?.textContent).toContain('Default choice');
      expect(view.component.hasNextPage).toBeFalse();
    });
    it(`keeps ${source} aria-expanded false for empty results with minChars zero`, async () => {
      const methods = {
        static: 'searchStatic',
        vocabulary: 'searchVocabularyEntries',
        service: 'searchService',
        external: 'searchExternal',
      } as const;
      const search = spyOn(TestBed.inject(TypeaheadDataService), methods[source]).and.resolveTo([]);
      const view = await render(0, 25, undefined, source);
      view.input.dispatchEvent(new Event('focus'));
      await settle();
      view.fixture.detectChanges();
      expect(search).toHaveBeenCalled();
      expect(view.directive.isOpen).toBeFalse();
      expect(view.input.getAttribute('aria-expanded')).toBe('false');
      search.and.resolveTo([{ label: 'Default choice', value: 'default' }]);
      await view.type('match');
      expect(view.directive.isOpen).toBeTrue();
      expect(view.input.getAttribute('aria-expanded')).toBe('true');
      search.and.resolveTo([]);
      await view.type('');
      expect(view.component.searchState).toBe('no-results');
      expect(view.component.isOpen).toBeFalse();
      expect(view.directive.isOpen).toBeFalse();
      expect(view.input.getAttribute('aria-expanded')).toBe('false');
      expect(view.fixture.nativeElement.querySelector('typeahead-container')).toBeNull();
    });
  }
  it('keeps a missing vocabulary reference collapsed when minChars is zero and input is cleared', async () => {
    const search = spyOn(TestBed.inject(TypeaheadDataService), 'searchVocabularyEntries');
    const view = await render(0, 25, undefined, 'vocabulary', { vocabRef: '' });
    view.input.dispatchEvent(new Event('focus'));
    await settle();
    view.fixture.detectChanges();
    await view.type('match');
    await view.type('');
    expect(search).not.toHaveBeenCalled();
    expect(view.component.searchState).toBe('misconfigured');
    expect(view.component.isOpen).toBeFalse();
    expect(view.directive.isOpen).toBeFalse();
    expect(view.input.getAttribute('aria-expanded')).toBe('false');
    expect(view.fixture.nativeElement.querySelector('typeahead-container')).toBeNull();
  });
  for (const [configured, effective] of [
    [100, 25],
    [3, 3],
  ]) {
    it(`aligns directive and request limits ${configured} to ${effective}`, async () => {
      const search = spyOn(TestBed.inject(TypeaheadDataService), 'searchNamedQueryLookup').and.resolveTo(
        page('match', true, effective)
      );
      const view = await render(1, configured);
      expect(view.directive.typeaheadOptionsLimit).toBe(configured);
      await view.type('match');
      expect(search.calls.mostRecent().args[3]).toBe(configured);
      expect(view.directive.typeaheadOptionsLimit).toBe(effective);
      expect(view.component.hasNextPage).toBeTrue();
      const status = view.fixture.nativeElement.querySelector(`#${view.component.statusElementId}`) as HTMLElement;
      expect(status.getAttribute('aria-live')).toBe('polite');
      expect(status.textContent).toContain('Refine your search');
      expect(view.input.getAttribute('aria-describedby')).toBe(status.id);
      expect(view.fixture.nativeElement.querySelectorAll('typeahead-container .dropdown-item').length).toBe(effective);
    });
  }
  for (const source of ['database', 'graphql']) {
    it(`renders the resolved ${source} limit through the real directive with maxResults 50`, async () => {
      const result = source === 'graphql' ? page('match', true, 25) : { options: page('match', false, 50).options };
      const search = spyOn(TestBed.inject(TypeaheadDataService), 'searchNamedQueryLookup').and.resolveTo(result);
      const view = await render(1, 50);
      await view.type('match');
      expect(search.calls.mostRecent().args[3]).toBe(50);
      const count = source === 'graphql' ? 25 : 50;
      expect(view.directive.typeaheadOptionsLimit).toBe(count);
      expect(view.fixture.nativeElement.querySelectorAll('typeahead-container .dropdown-item').length).toBe(count);
      expect(view.component.hasNextPage).toBe(source === 'graphql');
    });
  }
  it('keeps latest rendered options and continuation after out-of-order responses', async () => {
    const resolvers = new Map<string, (result: NamedQueryLookupResult<TypeaheadOption>) => void>();
    spyOn(TestBed.inject(TypeaheadDataService), 'searchNamedQueryLookup').and.callFake(
      (_id, term) => new Promise(resolve => resolvers.set(term, resolve))
    );
    const view = await render(1);
    await view.type('first');
    expect(view.input.getAttribute('aria-busy')).toBe('true');
    await view.type('second');
    resolvers.get('second')!(page('second'));
    await settle();
    view.fixture.detectChanges();
    expect(view.component.hasNextPage).toBeFalse();
    resolvers.get('first')!(page('first', true, 25));
    await settle();
    view.fixture.detectChanges();
    const list = view.fixture.nativeElement.querySelector('typeahead-container') as HTMLElement;
    expect(list.textContent).toContain('second');
    expect(list.textContent).not.toContain('first');
    expect(view.component.searchState).toBe('idle');
    expect(view.component.hasNextPage).toBeFalse();
  });
  it('ignores a stale failure and a late page after clearing below the threshold', async () => {
    let rejectFirst: (error: unknown) => void = () => undefined;
    let resolveLate: (result: NamedQueryLookupResult<TypeaheadOption>) => void = () => undefined;
    const search = spyOn(TestBed.inject(TypeaheadDataService), 'searchNamedQueryLookup').and.callFake((_id, term) => {
      if (term === 'first')
        return new Promise((_resolve, reject) => {
          rejectFirst = reject;
        });
      if (term === 'late')
        return new Promise(resolve => {
          resolveLate = resolve;
        });
      return Promise.resolve(page('current'));
    });
    const view = await render();
    await view.type('first');
    await view.type('current');
    rejectFirst(new TypeaheadLookupError(true));
    await settle();
    view.fixture.detectChanges();
    expect(view.component.searchState).toBe('idle');
    expect(view.component.hasNextPage).toBeFalse();
    await view.type('late');
    await view.type('a');
    const callsBefore = search.calls.count();
    resolveLate(page('late', true, 25));
    await settle();
    view.fixture.detectChanges();
    expect(search.calls.count()).toBe(callsBefore);
    expect(view.directive.isOpen).toBeFalse();
    expect(view.component.searchState).toBe('idle');
    expect(view.component.hasNextPage).toBeFalse();
  });
  it('does not cache GraphQL options or metadata across completed searches', async () => {
    const search = spyOn(TestBed.inject(TypeaheadDataService), 'searchNamedQueryLookup').and.resolveTo(
      page('first', true, 25)
    );
    const view = await render(1);
    await view.type('first');
    expect(view.component.hasNextPage).toBeTrue();
    search.and.resolveTo(page('first'));
    await view.type('first');
    expect(search).toHaveBeenCalledTimes(2);
    expect(view.component.hasNextPage).toBeFalse();
  });
  it('renders server-inspected JSON configuration failures before issuing a lookup', async () => {
    const search = spyOn(TestBed.inject(TypeaheadDataService), 'searchNamedQueryLookup');
    const view = await render(2, 25, [
      {
        code: 'LOOKUP_SEARCH_BINDING',
        capability: 'lookup',
        severity: 'warning',
        field: 'queryId',
        reason: 'Repair the configured search binding.',
        line: 0,
        column: 0,
      },
    ]);
    expect(view.component.searchState).toBe('misconfigured');
    await view.type('a');
    expect(view.component.searchState).toBe('misconfigured');
    await view.type('');
    expect(view.component.searchState).toBe('misconfigured');
    await view.type('search');
    expect(search).not.toHaveBeenCalled();
    expect(view.component.searchState).toBe('misconfigured');
    expect(view.component.hasNextPage).toBeFalse();
  });
  it('separates no-results, failures, and invalid configuration and clears continuation', async () => {
    const search = spyOn(TestBed.inject(TypeaheadDataService), 'searchNamedQueryLookup').and.resolveTo(
      page('first', true, 25)
    );
    const view = await render(1);
    await view.type('first');
    expect(view.component.hasNextPage).toBeTrue();
    search.and.resolveTo(page('empty', false, 0));
    await view.type('empty');
    expect(view.component.searchState).toBe('no-results');
    expect(view.component.hasNextPage).toBeFalse();
    search.and.rejectWith(new TypeaheadLookupError(false));
    await view.type('error');
    expect(view.component.searchState).toBe('error');
    search.and.rejectWith(new TypeaheadLookupError(true));
    await view.type('broken');
    expect(view.component.searchState).toBe('misconfigured');
    expect(view.component.hasNextPage).toBeFalse();
  });
});
