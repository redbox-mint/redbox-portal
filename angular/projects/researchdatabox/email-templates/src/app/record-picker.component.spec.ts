import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { RecordPickerComponent } from './record-picker.component';
import { commonProviders, serviceStub } from './email-templates.testing';

describe('RecordPickerComponent', () => {
  let fixture: ComponentFixture<RecordPickerComponent>;
  let component: RecordPickerComponent;
  let api: ReturnType<typeof serviceStub>;

  beforeEach(async () => {
    api = serviceStub();
    api['searchRecords'].and.callFake(async (q: string, page: number) => ({
      records: [{ oid: `oid-${q || 'all'}-${page}`, title: `Record ${q} ${page}` }],
      page,
      hasMore: page === 1,
    }));
    await TestBed.configureTestingModule({
      imports: [RecordPickerComponent],
      providers: commonProviders(api),
    }).compileComponents();
    fixture = TestBed.createComponent(RecordPickerComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
  });

  it('debounces searches and shows only the latest results', fakeAsync(() => {
    const input = fixture.nativeElement.querySelector('#et-record-search') as HTMLInputElement;
    input.value = 'so';
    input.dispatchEvent(new Event('input'));
    tick(100);
    input.value = 'soil';
    input.dispatchEvent(new Event('input'));
    tick(299);
    expect(api['searchRecords']).not.toHaveBeenCalled();
    tick(1);
    fixture.detectChanges();
    expect(api['searchRecords']).toHaveBeenCalledOnceWith('soil', 1);
    expect(fixture.nativeElement.textContent).toContain('Record soil 1');
  }));

  it('loads more pages and emits the chosen record', fakeAsync(() => {
    component.runSearch(1);
    tick();
    fixture.detectChanges();
    (fixture.nativeElement.querySelector('.btn-link') as HTMLButtonElement).click();
    tick();
    fixture.detectChanges();
    expect(component.results.length).toBe(2);
    const chosen: string[] = [];
    component.choose.subscribe(record => chosen.push(record.oid));
    (fixture.nativeElement.querySelectorAll('.et-picker-option')[1] as HTMLButtonElement).click();
    expect(chosen).toEqual(['oid-all-2']);
  }));

  it('shows the selection with a Change button that reopens search', fakeAsync(() => {
    fixture.componentRef.setInput('selected', { oid: 'rec-1', title: 'Soil carbon survey 2024' });
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Soil carbon survey 2024');
    expect(fixture.nativeElement.querySelector('#et-record-search')).toBeNull();
    (fixture.nativeElement.querySelector('.btn-outline-secondary') as HTMLButtonElement).click();
    tick();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('#et-record-search')).toBeTruthy();
  }));
  it('UR-B02 disables obsolete options immediately and rejects late responses during debounce', fakeAsync(() => {
    component.query = 'Beta';
    component.runSearch(1); tick(); fixture.detectChanges();
    const beta = component.results[0];
    const choose = spyOn(component.choose, 'emit');
    let resolve!: (value: any) => void;
    api['searchRecords'].and.returnValue(new Promise(done => resolve = done));
    component.runSearch(1); // An outstanding request for the old query.
    component.query = 'Alpha'; component.onQueryChange(); fixture.detectChanges();
    expect(component.canPick).toBeFalse();
    expect((fixture.nativeElement.querySelector('.et-picker-option') as HTMLButtonElement).disabled).toBeTrue();
    component.pick(beta); expect(choose).not.toHaveBeenCalled();
    resolve({ records: [{ oid: 'late-beta', title: 'Late Beta' }], page: 1, hasMore: false }); tick(299);
    expect(component.results).toEqual([beta]);
    expect(component.busy).toBeTrue();
    api['searchRecords'].and.resolveTo({ records: [{ oid: 'alpha', title: 'Alpha' }], page: 1, hasMore: false });
    tick(1); fixture.detectChanges();
    expect(component.canPick).toBeTrue();
    component.pick(beta); expect(choose).not.toHaveBeenCalled();
    component.pick(component.results[0]); expect(choose).toHaveBeenCalledWith({ oid: 'alpha', title: 'Alpha' });
  }));

  it('UR-B02 ignores late errors and teardown responses from obsolete requests', fakeAsync(() => {
    let reject!: (error: unknown) => void;
    api['searchRecords'].and.returnValue(new Promise((_resolve, fail) => reject = fail));
    component.runSearch(1);
    component.query = 'next'; component.onQueryChange();
    reject(new Error('Old search')); tick(299);
    expect(component.failed).toBeFalse(); expect(component.busy).toBeTrue();
    fixture.destroy(); tick();
  }));

  it('UR-B02 can resume a cancelled search whose query changed during debounce', fakeAsync(() => {
    component.query = 'Beta'; component.runSearch(1); tick();
    component.query = 'Alpha'; component.onQueryChange(); component.cancelSearch();
    tick(300); expect(component.busy).toBeFalse();
    component.startSearch(); tick();
    expect(api['searchRecords']).toHaveBeenCalledWith('Alpha', 1);
    expect(component.canPick).toBeTrue();
    expect(component.results[0].title).toContain('Alpha');
  }));

});
