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
});
