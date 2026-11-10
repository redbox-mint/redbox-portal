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
    expect(fixture.nativeElement.textContent).toContain('email-templates-brand brand=default');
  });

  it('opens a template into the URL hash and returns to the catalogue', async () => {
    await settle();
    component.openTemplate('a/b');
    fixture.detectChanges();
    expect(window.location.hash).toBe('#/templates/a%2Fb');
    expect(fixture.nativeElement.querySelector('email-templates-editor')).toBeTruthy();
    expect(api['editorState']).toHaveBeenCalledWith('a/b');
    component.openCatalogue();
    fixture.detectChanges();
    expect(window.location.hash).toBe('');
    expect(fixture.nativeElement.querySelector('email-templates-catalogue')).toBeTruthy();
  });

  it('opens the editor directly from a deep link', async () => {
    history.replaceState(null, '', '#/templates/publicationReview');
    await settle();
    expect(component.templateId).toBe('publicationReview');
  });
});
