import { ComponentFixture, TestBed } from '@angular/core/testing';
import { EmailTemplatesComponent } from './email-templates.component';
import { EmailTemplateAdminService } from './email-template-admin.service';
import { catalogueEntry, commonProviders, serviceStub } from './email-templates.testing';

describe('EmailTemplatesComponent', () => {
  let fixture: ComponentFixture<EmailTemplatesComponent>;
  let component: EmailTemplatesComponent;
  let api: ReturnType<typeof serviceStub>;
  let originalHash: string;

  beforeEach(async () => {
    originalHash = window.location.hash;
    history.replaceState(null, '', window.location.pathname + window.location.search);
    api = serviceStub();
    api['catalogue'].and.resolveTo([catalogueEntry()]);
    await TestBed.configureTestingModule({
      imports: [EmailTemplatesComponent],
      providers: commonProviders(api),
    })
      .overrideComponent(EmailTemplatesComponent, {
        set: { providers: [{ provide: EmailTemplateAdminService, useValue: api }] },
      })
      .compileComponents();
    fixture = TestBed.createComponent(EmailTemplatesComponent);
    component = fixture.componentInstance;
  });

  afterEach(() => {
    history.replaceState(null, '', window.location.pathname + window.location.search + originalHash);
  });

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await component.waitForInit();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('shows the catalogue with the route brand by default', async () => {
    await settle();
    expect(fixture.nativeElement.querySelector('email-templates-catalogue')).toBeTruthy();
    expect(fixture.nativeElement.textContent).not.toContain('email-templates-brand');
  });

  it('opens a template into the URL hash and returns to the catalogue', async () => {
    await settle();
    await component.openTemplate('a/b');
    fixture.detectChanges();
    expect(window.location.hash).toBe('#/templates/a%2Fb');
    expect(fixture.nativeElement.querySelector('email-templates-editor')).toBeTruthy();
    expect(api['editorState']).toHaveBeenCalledWith('a/b');
    await component.openCatalogue();
    fixture.detectChanges();
    expect(window.location.hash).toBe('');
    expect(fixture.nativeElement.querySelector('email-templates-catalogue')).toBeTruthy();
  });

  it('opens the editor directly from a deep link', async () => {
    history.replaceState(null, '', '#/templates/publicationReview');
    await settle();
    expect(component.templateId).toBe('publicationReview');
  });
  it('ET-01/ET-06 creates an independent editor for each template ID and scopes conflict state', async () => {
    await settle(); await component.openTemplate('publicationReview'); await settle();
    const first = component.editor!;
    first.conflictContent = { ...first.content, body: 'Held conflict' };
    first.content = first.conflictContent;
    await component.openTemplate('test'); await settle();
    expect(component.editor).not.toBe(first);
    expect(component.editor!.conflictContent).toBeNull();
    expect(api['heldEdits'].get('publicationReview').content.body).toBe('Held conflict');
  });
  it('ET-03 uses the save boundary on direct hash changes and browser history events', async () => {
    await settle(); await component.openTemplate('publicationReview'); await settle();
    let resolve!: (value: boolean) => void;
    const prepare = spyOn(component.editor!, 'prepareToLeave').and.returnValue(new Promise(done => resolve = done));
    history.replaceState(null, '', '#/templates/test');
    const navigation = component.readHash();
    expect(component.templateId).toBe('publicationReview');
    resolve(true); await navigation; fixture.detectChanges();
    expect(prepare).toHaveBeenCalled(); expect(component.templateId).toBe('test');
  });

  it('UR-B03 focuses the mounted heading and restores the opening action on in-app and history navigation', async () => {
    api['catalogue'].and.resolveTo([catalogueEntry({ defaultUpdated: true })]);
    await settle();
    const button = fixture.nativeElement.querySelector('[data-template-action="default-updated"]') as HTMLButtonElement;
    button.focus(); button.click(); await settle();
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('email-templates-editor h1[tabindex="-1"]'));
    await component.openCatalogue(); await settle();
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('[data-template-action="default-updated"]'));
    history.replaceState(null, '', '#/templates/publicationReview');
    window.dispatchEvent(new PopStateEvent('popstate')); await settle();
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('email-templates-editor h1'));
    history.replaceState(null, '', window.location.pathname + window.location.search);
    window.dispatchEvent(new PopStateEvent('popstate')); await settle();
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('[data-template-action="default-updated"]'));
  });

  it('UR-B03 restores the main template action after leaving a deep link', async () => {
    history.replaceState(null, '', '#/templates/publicationReview'); await settle();
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('email-templates-editor h1'));
    await component.openCatalogue(); await settle();
    expect(document.activeElement).toBe(fixture.nativeElement.querySelector('[data-template-action="open"]'));
  });

  it('UR-U04 retains independent preview workspaces when editors are destroyed and reopened', async () => {
    await settle(); await component.openTemplate('publicationReview'); await settle();
    await component.editor!.loadRecord({ oid: 'one', title: 'One' });
    component.editor!.onContextChange('{record: {metadata: {title: "Edited one"}}}');
    await component.openTemplate('test'); await settle();
    await component.editor!.loadRecord({ oid: 'two', title: 'Two' });
    component.editor!.onContextChange('{record: {metadata: {title: "Edited two"}}}');
    await component.openTemplate('publicationReview'); await settle();
    expect(component.editor!.record!.oid).toBe('one');
    expect(component.editor!.contextText).toContain('Edited one');
    expect(component.editor!.contextEdited).toBeTrue();
    await component.openCatalogue(); await settle();
    await component.openTemplate('test'); await settle();
    expect(component.editor!.record!.oid).toBe('two');
    expect(component.editor!.contextText).toContain('Edited two');
  });

});
