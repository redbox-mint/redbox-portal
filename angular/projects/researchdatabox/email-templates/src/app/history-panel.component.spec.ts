import { ComponentFixture, TestBed } from '@angular/core/testing';
import { HistoryPanelComponent } from './history-panel.component';
import { commonProviders, historyEntry, serviceStub } from './email-templates.testing';

describe('HistoryPanelComponent', () => {
  let fixture: ComponentFixture<HistoryPanelComponent>;
  let component: HistoryPanelComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [HistoryPanelComponent],
      providers: commonProviders(serviceStub()),
    }).compileComponents();
    fixture = TestBed.createComponent(HistoryPanelComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('versions', [
      historyEntry({ version: 4, live: true }),
      historyEntry({ version: 3, event: 'restore-published', restoredFromVersion: 1 }),
      historyEntry({ version: 2, event: 'reset', subject: null, body: null, format: null }),
      historyEntry({ version: 1 }),
    ]);
    fixture.componentRef.setInput('retention', 50);
    fixture.detectChanges();
  });

  const row = (version: number): HTMLElement => fixture.nativeElement.querySelector(`tr[data-version="${version}"]`);

  it('shows events, the live marker and the retention note', () => {
    expect(row(4).textContent).toContain('email-templates-badge-live');
    expect(row(3).textContent).toContain('email-templates-event-restore-published version=1');
    expect(row(2).textContent).toContain('email-templates-event-reset');
    expect(fixture.nativeElement.textContent).toContain('email-templates-history-retention count=50');
  });

  it('cannot restore a reset entry and emits restore for others', () => {
    expect(row(2).querySelectorAll('button').length).toBe(1);
    const restored: number[] = [];
    component.restore.subscribe(entry => restored.push(entry.version));
    (row(1).querySelectorAll('button')[1] as HTMLButtonElement).click();
    expect(restored).toEqual([1]);
  });

  it('disables restore for an unapplied reservation', () => {
    fixture.componentRef.setInput('versions', [historyEntry({ version: 5, applied: false })]);
    fixture.detectChanges();
    expect(row(5).textContent).toContain('email-templates-badge-not-applied');
    expect((row(5).querySelectorAll('button')[1] as HTMLButtonElement).disabled).toBeTrue();
  });
});
