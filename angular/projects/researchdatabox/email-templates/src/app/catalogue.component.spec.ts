import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CatalogueComponent } from './catalogue.component';
import { catalogueEntry, commonProviders, serviceStub } from './email-templates.testing';

describe('CatalogueComponent', () => {
  let fixture: ComponentFixture<CatalogueComponent>;
  let component: CatalogueComponent;
  let api: ReturnType<typeof serviceStub>;

  beforeEach(async () => {
    api = serviceStub();
    api['catalogue'].and.resolveTo([
      catalogueEntry({ templateId: 'publicationReview', hasDraft: true, draftRevision: 7 }),
      catalogueEntry({
        templateId: 'publicationPublished',
        description: 'Your publication has been published',
        defaultUpdated: true,
        liveVersion: 2,
      }),
      catalogueEntry({ templateId: 'transferOwnerTo', invalid: true, liveVersion: 1 }),
      catalogueEntry({
        templateId: 'publicationStaged',
        description: 'ReDBox Notification',
        source: 'default',
        liveVersion: null,
        updatedAt: null,
        updatedByName: null,
      }),
    ]);
    await TestBed.configureTestingModule({
      imports: [CatalogueComponent],
      providers: commonProviders(api),
    }).compileComponents();
    fixture = TestBed.createComponent(CatalogueComponent);
    component = fixture.componentInstance;
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  });

  const rows = (): HTMLElement[] => Array.from(fixture.nativeElement.querySelectorAll('tbody tr[data-template-id]'));
  const row = (id: string): HTMLElement => fixture.nativeElement.querySelector(`tr[data-template-id="${id}"]`);

  it('lists every template with status badges, live version and last change', () => {
    expect(rows().length).toBe(4);
    expect(row('publicationReview').textContent).toContain('email-templates-badge-overridden');
    expect(row('publicationReview').textContent).toContain('email-templates-badge-draft');
    expect(row('publicationReview').textContent).toContain('v4');
    expect(row('publicationReview').textContent).toContain('Jo Smith');
    expect(row('publicationPublished').textContent).toContain('email-templates-badge-default-updated');
    expect(row('transferOwnerTo').textContent).toContain('email-templates-badge-invalid');
    expect(row('publicationStaged').textContent).toContain('email-templates-badge-default');
    expect(row('publicationStaged').textContent).toContain('email-templates-supplied-default');
  });

  it('offers Customise for untouched defaults and Edit otherwise', () => {
    expect(row('publicationStaged').querySelector('button')!.textContent).toContain('email-templates-action-customise');
    expect(row('publicationReview').querySelector('td:last-child button')!.textContent).toContain(
      'email-templates-action-edit'
    );
  });

  it('filters by quick filter with counts', () => {
    expect(component.count('overridden')).toBe(3);
    expect(component.count('drafts')).toBe(1);
    expect(component.count('attention')).toBe(2);
    const buttons = Array.from(
      fixture.nativeElement.querySelectorAll('.et-quick-filters button')
    ) as HTMLButtonElement[];
    buttons[3].click();
    fixture.detectChanges();
    expect(buttons[3].getAttribute('aria-pressed')).toBe('true');
    expect(rows().map(r => r.dataset['templateId'])).toEqual(['publicationPublished', 'transferOwnerTo']);
  });

  it('filters by ID or subject text', async () => {
    const input = fixture.nativeElement.querySelector('#et-catalogue-filter') as HTMLInputElement;
    input.value = 'has been published';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(rows().map(r => r.dataset['templateId'])).toEqual(['publicationPublished']);
  });

  it('opens the editor from the action button and the Default updated badge', () => {
    const opened: string[] = [];
    component.openTemplate.subscribe((id: string) => opened.push(id));
    (row('publicationStaged').querySelector('button') as HTMLButtonElement).click();
    (row('publicationPublished').querySelector('.et-badge-button') as HTMLButtonElement).click();
    expect(opened).toEqual(['publicationStaged', 'publicationPublished']);
  });

  it('shows a retry when loading fails', async () => {
    api['catalogue'].and.rejectWith(new Error('down'));
    await component.load();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.alert-danger').textContent).toContain(
      'email-templates-catalogue-load-failed'
    );
  });

  it('UR-U05 shows the purpose with a quieter subject, and the subject alone when there is no purpose', async () => {
    api['catalogue'].and.resolveTo([
      catalogueEntry({
        templateId: 'publicationReview',
        description: 'Sent when a publication is ready for review',
        subject: 'ReDBox Notification',
      }),
      catalogueEntry({ templateId: 'hookOnly', description: undefined, subject: 'Hook subject' }),
    ]);
    await component.load();
    fixture.detectChanges();
    const described = row('publicationReview');
    expect(described.querySelector('.et-description')!.textContent).toBe('Sent when a publication is ready for review');
    expect(described.querySelector('.et-subject .et-subject-label')!.textContent).toBe(
      'email-templates-catalogue-subject'
    );
    expect(described.querySelector('.et-subject-text')!.textContent).toBe('ReDBox Notification');
    expect(described.querySelector('.et-subject-only')).toBeNull();
    const plain = row('hookOnly');
    expect(plain.querySelector('.et-description')).toBeNull();
    expect(plain.querySelector('.et-subject.et-subject-only .et-subject-text')!.textContent).toBe('Hook subject');
  });

  it('UR-U05 explains badges, the Live default and Needs attention', () => {
    const legend = fixture.nativeElement.querySelector('.et-legend') as HTMLElement;
    expect(legend.getAttribute('aria-label')).toBe('email-templates-legend-label');
    const terms = Array.from(legend.querySelectorAll('dt')).map(node => node.textContent!.trim());
    expect(terms).toEqual([
      'email-templates-badge-default',
      'email-templates-badge-overridden',
      'email-templates-badge-draft',
      'email-templates-filter-attention',
    ]);
    for (const key of ['default', 'overridden', 'draft', 'attention']) {
      expect(legend.textContent).toContain(`email-templates-legend-${key}`);
    }
    expect(row('publicationReview').querySelector('.et-badge-draft')!.getAttribute('title')).toBe(
      'email-templates-legend-draft'
    );
    expect(row('publicationStaged').querySelector('.et-badge-default')!.getAttribute('title')).toBe(
      'email-templates-legend-default'
    );

    const live = row('publicationStaged').querySelector('.et-version .et-live-default') as HTMLElement;
    expect(live.textContent!.trim()).toBe('email-templates-live-default');
    expect(live.getAttribute('title')).toBe('email-templates-live-default-title');
    expect(row('publicationStaged').querySelector('.et-version')!.textContent).not.toContain('—');

    const attention = Array.from(fixture.nativeElement.querySelectorAll('.et-quick-filters button'))[3] as HTMLElement;
    expect(attention.getAttribute('aria-describedby')).toBe('et-legend-attention');
    expect(fixture.nativeElement.querySelector('#et-legend-attention').textContent).toBe(
      'email-templates-legend-attention'
    );
  });
});
