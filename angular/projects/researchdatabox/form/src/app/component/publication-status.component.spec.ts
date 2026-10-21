import { fakeAsync, TestBed, tick } from '@angular/core/testing';
import { IntegrationStatusComponent } from './integration-status.component';
import { createTestbedModule } from '../helpers.spec';
import { IntegrationStatusItem, RecordService, UserService } from '@researchdatabox/portal-ng-common';
import { publicationEvidenceKeys, publicationReasonKey, publicationStatusLinks } from './publication-status';
import english from '../../../../../../../language-defaults/en/translation.json';

const row = (id: string, provider: string, status = 'waiting'): IntegrationStatusItem => ({
  integrationName: provider,
  providerId: provider,
  destinationId: id,
  displayName: id === 'figshare-main' ? 'Institutional Figshare' : id,
  status: 'pending',
  workStatus: status,
  startedAt: '',
  traceId: `publication-live:${id}`,
  outcome: { state: status, severity: 'pending', labelKey: `@publication-live-${status}` },
});

describe('Publication destination status (PUB-14)', () => {
  let service: jasmine.SpyObj<RecordService>;
  let useEnglish: () => void;
  beforeEach(async () => {
    service = jasmine.createSpyObj<RecordService>('RecordService', ['getRecordIntegrationStatus', 'waitForInit']);
    service.waitForInit.and.resolveTo();
    service.getRecordIntegrationStatus.and.resolveTo({ integrations: [] });
    const { translationService } = await createTestbedModule({
      declarations: { IntegrationStatusComponent },
      providers: [
        { provide: RecordService, useValue: service },
        {
          provide: UserService,
          useValue: { waitForInit: async () => {}, getInfo: async () => ({ roles: [{ name: 'Researcher' }] }) },
        },
      ],
    });
    useEnglish = () => {
      translationService.translationMap = english;
    };
  });
  const render = (rows: IntegrationStatusItem[]) => {
    service.getRecordIntegrationStatus.and.resolveTo({ integrations: rows });
    const fixture = TestBed.createComponent(IntegrationStatusComponent);
    const component = fixture.componentInstance;
    component.componentDefinition = {
      class: 'IntegrationStatusComponent',
      config: { integrationNames: ['figshare', 'oni'], pollIntervalMs: 100, maxPollAttempts: 3 },
    };
    component['oid'].set('record-1');
    fixture.detectChanges();
    void component['fetchStatus']();
    tick(0);
    fixture.detectChanges();
    return fixture;
  };
  it('renders independent same-provider rows and pending source reasons immediately after reload', fakeAsync(() => {
    const fixture = render([
      { ...row('figshare-main', 'figshare', 'queued'), waitingReason: 'source_import_pending' },
      row('figshare-second', 'figshare', 'repair_required'),
    ]);
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelectorAll('#integration-status-body > ul > li').length).toBe(2);
    expect(root.textContent).toContain('Institutional Figshare');
    expect(root.textContent).toContain('figshare-second');
    expect(root.textContent).toContain('@publication-reason-queued');
    expect(service.getRecordIntegrationStatus).toHaveBeenCalledWith('record-1', { integrationName: 'figshare,oni' });
    fixture.destroy();
  }));
  for (const quarantined of [false, true]) {
    it(`renders translated migrated ${quarantined ? 'quarantine' : 'historical observation'} without claiming current completion`, fakeAsync(() => {
      useEnglish();
      const reason = quarantined ? 'migration_quarantine' : 'historical_observation_only';
      const workStatus = quarantined ? 'repair_required' : 'paused';
      const item: IntegrationStatusItem = {
        ...row('oni-research', 'oni', workStatus),
        waitingReason: reason,
        status: quarantined ? 'failed' : 'pending',
        outcome: {
          state: workStatus,
          severity: quarantined ? 'error' : 'pending',
          labelKey: `@publication-live-${workStatus}`,
        },
        observation: {
          current: false,
          deposit: 'unverified',
          publication: 'unverified',
          ingestion: 'unverified',
          visibility: 'unverified',
        },
        links: { historical: 'https://repository.example/old' },
      };
      expect(publicationReasonKey(item)).toBe(
        `@publication-reason-${quarantined ? 'migration-quarantine' : 'historical-observation'}`
      );
      const fixture = render([item]);
      const root = fixture.nativeElement as HTMLElement;
      expect(root.querySelector('[role="status"]')?.textContent?.trim()).toBe(
        quarantined ? 'Administrator action required' : 'Processing paused'
      );
      expect(root.textContent).toContain(
        quarantined ? 'Migration requires administrator review' : 'Historical publication only'
      );
      expect(root.textContent).toContain('Open publication (current request is not confirmed)');
      expect(root.textContent).not.toMatch(
        /@publication-|migration_quarantine|historical_observation_only|Completed|Source changed|Waiting for the destination/
      );
      expect(root.querySelector('.badge.text-bg-success')).toBeNull();
      expect(root.querySelector(quarantined ? '.badge.text-bg-danger' : '.badge.text-bg-warning')).not.toBeNull();
      expect(fixture.componentInstance['isPolling']()).toBeFalse();
      fixture.destroy();
    }));
  }
  it('filters providers and destination IDs without collapsing siblings', fakeAsync(() => {
    const fixture = render([
      row('figshare-main', 'figshare'),
      row('figshare-second', 'figshare'),
      row('oni-research', 'oni'),
    ]);
    const root = fixture.nativeElement as HTMLElement;
    const selects = root.querySelectorAll('select');
    selects[0].value = 'figshare';
    selects[0].dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(root.querySelectorAll('#integration-status-body > ul > li').length).toBe(2);
    selects[1].value = 'figshare-second';
    selects[1].dispatchEvent(new Event('change'));
    fixture.detectChanges();
    expect(root.querySelectorAll('#integration-status-body > ul > li').length).toBe(1);
    expect(root.querySelector('#integration-status-body > ul')?.textContent).toContain('figshare-second');
    fixture.destroy();
  }));
  it('shows Oni deposit and indexing evidence without implying object discoverability, including after reload', fakeAsync(() => {
    const item = {
      ...row('oni-research', 'oni', 'completed'),
      status: 'success',
      completion: {
        current: true,
        deposit: 'confirmed' as const,
        publication: 'unverified' as const,
        ingestion: 'confirmed' as const,
        visibility: 'unverified' as const,
      },
      links: { repository: 'https://repository.example/object/1' },
    };
    const fixture = render([item]);
    const root = fixture.nativeElement as HTMLElement;
    expect(root.textContent).toContain('@publication-evidence-deposit-confirmed');
    expect(root.textContent).toContain('@publication-evidence-ingestion-confirmed');
    expect(root.textContent).toContain('@publication-evidence-visibility-unverified');
    expect(root.textContent).not.toContain('@publication-evidence-publication-confirmed');
    expect(root.querySelector('a')?.getAttribute('href')).toBe('https://repository.example/object/1');
    fixture.destroy();
  }));
  it('labels old evidence and links while newer content is pending', () => {
    const item: IntegrationStatusItem = {
      ...row('oni-research', 'oni', 'queued'),
      completion: {
        current: false,
        deposit: 'confirmed',
        publication: 'unverified',
        ingestion: 'confirmed',
        visibility: 'unverified',
      },
      links: { old: 'https://repository.example/old' },
    };
    expect(publicationEvidenceKeys(item)).toEqual(['@publication-evidence-historical']);
    expect(publicationStatusLinks(item)[0].current).toBeFalse();
  });
  it('maps disabled and misconfigured states to actionable messages and hides raw reasons and unsafe links', fakeAsync(() => {
    const fixture = render([
      { ...row('figshare-main', 'figshare', 'paused'), waitingReason: 'processing_disabled' },
      { ...row('oni-research', 'oni', 'repair_required'), waitingReason: 'configuration_unavailable' },
    ]);
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('@publication-reason-paused');
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('@publication-reason-configuration');
    expect(
      publicationReasonKey({ ...row('x', 'oni', 'repair_required'), waitingReason: 'private_checkpoint_name' })
    ).toBe('@publication-reason-repair');
    expect(
      publicationStatusLinks({
        ...row('x', 'oni'),
        links: {
          a: 'javascript:alert(1)',
          b: 'https://user:password@example.org/',
          c: 'https://example.org/?token=private',
        },
      })
    ).toEqual([]);
    fixture.destroy();
  }));
  it('polls pending Oni work and stops after completion', fakeAsync(() => {
    const fixture = render([row('oni-research', 'oni', 'queued')]);
    expect(fixture.componentInstance['isPolling']()).toBeTrue();
    service.getRecordIntegrationStatus.and.resolveTo({
      integrations: [{ ...row('oni-research', 'oni', 'completed'), status: 'success' }],
    });
    tick(100);
    fixture.detectChanges();
    expect(fixture.componentInstance['isPolling']()).toBeFalse();
    fixture.destroy();
  }));
  it('shows a recoverable loading error to a researcher', fakeAsync(() => {
    const fixture = render([]);
    service.getRecordIntegrationStatus.and.rejectWith(new Error('secret response'));
    void fixture.componentInstance['fetchStatus']();
    tick(0);
    fixture.detectChanges();
    expect((fixture.nativeElement as HTMLElement).textContent).toContain('@publication-status-load-error');
    expect((fixture.nativeElement as HTMLElement).textContent).not.toContain('secret response');
    fixture.destroy();
  }));
});
