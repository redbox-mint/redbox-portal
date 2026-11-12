import { TestBed, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { Subject } from 'rxjs';
import { TranslationService } from '@researchdatabox/portal-ng-common';
import type { NamedQueryPromotionDraft, SavedExplorerQuerySummary } from '@researchdatabox/sails-ng-common';
import { NamedQueryApiService } from './named-query-api.service';
import { SavedQueryChooserComponent } from './saved-query-chooser.component';

const summary = (id = 'a'.repeat(24), revision = 3): SavedExplorerQuerySummary => ({
  id,
  revision,
  name: 'Saved research plans',
  mode: 'graphql',
  recordType: 'rdmp',
  recordTypeLabel: 'Research plans',
  updatedAt: null,
  updatedBy: null,
  publishedAs: [],
});
const prepared: NamedQueryPromotionDraft = {
  definition: {
    source: 'graphql',
    graphql: {
      document: '{ records(recordType:"rdmp") { nodes { oid } } }',
      variables: {},
      resultPath: ['records', 'nodes'],
    },
  },
  variableValues: {},
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>(yes => (resolve = yes));
  return { resolve, promise };
}

describe('Saved query chooser', () => {
  let api: jasmine.SpyObj<NamedQueryApiService>;
  beforeEach(async () => {
    api = jasmine.createSpyObj('api', ['savedQueries', 'fromSavedQuery'], { brandingAndPortalUrl: '/brand/portal' });
    api.savedQueries.and.resolveTo({ grids: [summary()], next: null });
    api.fromSavedQuery.and.resolveTo(prepared);
    await TestBed.configureTestingModule({
      imports: [SavedQueryChooserComponent],
      providers: [
        { provide: NamedQueryApiService, useValue: api },
        {
          provide: TranslationService,
          useValue: { translationChanges$: new Subject(), isInitializing: () => false, t: (key: string) => key },
        },
      ],
    }).compileComponents();
  });
  it('defaults to saved queries and prepares the exact selected revision without publishing', async () => {
    const f = TestBed.createComponent(SavedQueryChooserComponent);
    f.detectChanges();
    await f.whenStable();
    f.detectChanges();
    const c = f.componentInstance;
    expect(c.start).toBe('saved');
    expect(c.selected).toBeNull();
    const emit = spyOn(c.chosen, 'emit');
    const radios = f.nativeElement.querySelectorAll('input[name="nq-saved"]');
    radios[0].click();
    f.detectChanges();
    await c.continue();
    expect(api.fromSavedQuery).toHaveBeenCalledOnceWith('a'.repeat(24), 3);
    expect(emit).toHaveBeenCalledOnceWith({ summary: summary(), prepared });
    expect(f.nativeElement.querySelector('[role="dialog"]').getAttribute('aria-modal')).toBe('true');
    f.destroy();
  });
  it('passes server search/mode/cursor and retains earlier pages', fakeAsync(() => {
    const f = TestBed.createComponent(SavedQueryChooserComponent);
    f.detectChanges();
    flushMicrotasks();
    const c = f.componentInstance;
    c.search = '[plans]';
    c.mode = 'visual';
    c.filtersChanged();
    tick(250);
    flushMicrotasks();
    expect(api.savedQueries).toHaveBeenCalledWith({ q: '[plans]', mode: 'visual' });
    c.next = 'b'.repeat(24);
    api.savedQueries.and.resolveTo({ grids: [summary('c'.repeat(24))], next: null });
    void c.load(true);
    flushMicrotasks();
    expect(api.savedQueries).toHaveBeenCalledWith({ q: '[plans]', mode: 'visual', after: 'b'.repeat(24) });
    expect(c.rows.length).toBe(2);
    expect(c.next).toBeNull();
    f.destroy();
  }));
  it('rejects a stale filter response and clears a selection before applying new filters', fakeAsync(() => {
    const pending = deferred<{ grids: SavedExplorerQuerySummary[]; next: null }>();
    api.savedQueries.and.returnValue(pending.promise);
    const f = TestBed.createComponent(SavedQueryChooserComponent);
    f.detectChanges();
    const c = f.componentInstance;
    c.selected = summary();
    c.search = 'current';
    c.filtersChanged();
    expect(c.selected).toBeNull();
    pending.resolve({ grids: [summary()], next: null });
    flushMicrotasks();
    expect(c.rows).toEqual([]);
    api.savedQueries.and.resolveTo({ grids: [], next: null });
    tick(250);
    flushMicrotasks();
    expect(c.rows).toEqual([]);
    f.destroy();
  }));
  for (const status of [409, 404])
    it(`explains ${status}, refreshes and requires a fresh selection`, async () => {
      const f = TestBed.createComponent(SavedQueryChooserComponent);
      f.detectChanges();
      await f.whenStable();
      const c = f.componentInstance;
      c.selected = summary();
      api.fromSavedQuery.and.rejectWith({ status });
      await c.continue();
      f.detectChanges();
      expect(c.error).toBe(status === 409 ? 'nq-ux-source-conflict' : 'nq-ux-source-gone');
      expect(c.selected).toBeNull();
      expect(api.savedQueries).toHaveBeenCalledTimes(2);
      f.destroy();
    });
  it('offers an explorer link for an empty catalogue and retry for a failed request', async () => {
    api.savedQueries.and.resolveTo({ grids: [], next: null });
    const f = TestBed.createComponent(SavedQueryChooserComponent);
    f.detectChanges();
    await f.whenStable();
    f.detectChanges();
    expect(f.nativeElement.querySelector('.rb-admin-empty a').getAttribute('href')).toBe(
      '/brand/portal/admin/data-grids'
    );
    api.savedQueries.and.rejectWith({ status: 503 });
    await f.componentInstance.load();
    f.detectChanges();
    expect(f.nativeElement.querySelector('[role="alert"]').textContent).toContain('nq-ux-chooser-load-error');
    f.destroy();
  });
  it('shows publication links and emits the database choice', async () => {
    api.savedQueries.and.resolveTo({
      grids: [
        {
          ...summary(),
          publishedAs: [{ name: 'published_plans', publishedRevision: 3, changedSincePublished: false }],
        },
      ],
      next: null,
    });
    const f = TestBed.createComponent(SavedQueryChooserComponent);
    f.detectChanges();
    await f.whenStable();
    f.detectChanges();
    expect(f.nativeElement.querySelector('tbody a').getAttribute('href')).toBe(
      '/brand/portal/admin/named-query#query=published_plans'
    );
    const c = f.componentInstance;
    const emit = spyOn(c.database, 'emit');
    c.start = 'database';
    await c.continue();
    expect(emit).toHaveBeenCalledOnceWith();
    expect(api.fromSavedQuery).not.toHaveBeenCalled();
    f.destroy();
  });
  it('traps focus, excludes the portal and restores the opening control on Escape', async () => {
    const trigger = document.createElement('button');
    document.body.appendChild(trigger);
    trigger.focus();
    const f = TestBed.createComponent(SavedQueryChooserComponent);
    f.detectChanges();
    await f.whenStable();
    f.detectChanges();
    expect(trigger.inert).toBeTrue();
    expect(document.activeElement).toBe(f.nativeElement.querySelector('.modal-header button'));
    const close = spyOn(f.componentInstance.closed, 'emit');
    f.nativeElement
      .querySelector('[role="dialog"]')
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(close).toHaveBeenCalled();
    f.destroy();
    await new Promise(resolve => setTimeout(resolve, 0));
    expect(trigger.inert).toBeFalse();
    expect(document.activeElement).toBe(trigger);
    trigger.remove();
  });
  it('retains the draft on permission errors and prevents duplicate preparation/dismissal', async () => {
    const pending = deferred<NamedQueryPromotionDraft>();
    api.fromSavedQuery.and.returnValue(pending.promise);
    const f = TestBed.createComponent(SavedQueryChooserComponent);
    f.detectChanges();
    await f.whenStable();
    const c = f.componentInstance;
    c.selected = summary();
    const close = spyOn(c.closed, 'emit');
    const saving = c.continue();
    await c.continue();
    c.close();
    expect(close).not.toHaveBeenCalled();
    expect(api.fromSavedQuery).toHaveBeenCalledTimes(1);
    pending.resolve(prepared);
    await saving;
    api.fromSavedQuery.and.rejectWith({ status: 403 });
    await c.continue();
    expect(c.error).toBe('nq-ux-source-denied');
    expect(c.selected).toEqual(summary());
    f.destroy();
  });
});
