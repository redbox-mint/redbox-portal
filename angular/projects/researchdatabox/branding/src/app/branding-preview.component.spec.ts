import { TestBed } from '@angular/core/testing';
import { BrandingPreviewComponent } from './branding-preview.component';

describe('BrandingPreviewComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BrandingPreviewComponent]
    }).compileComponents();
  });

  it('should create and render contextual buttons including Light/Dark', () => {
    const fixture = TestBed.createComponent(BrandingPreviewComponent);
    const comp = fixture.componentInstance;
    fixture.detectChanges();

    const host: HTMLElement = fixture.nativeElement as HTMLElement;
    const root = (host.shadowRoot as ShadowRoot);
    expect(root).toBeTruthy();

    const btn = (cls: string) => root.querySelector(`button.btn.${cls}`) as HTMLButtonElement | null;
    expect(btn('btn-primary')).withContext('primary button').not.toBeNull();
    expect(btn('btn-secondary')).withContext('secondary button').not.toBeNull();
    expect(btn('btn-success')).withContext('success button').not.toBeNull();
    expect(btn('btn-info')).withContext('info button').not.toBeNull();
    expect(btn('btn-warning')).withContext('warning button').not.toBeNull();
    expect(btn('btn-danger')).withContext('danger button').not.toBeNull();
    expect(btn('btn-light')).withContext('light button').not.toBeNull();
    expect(btn('btn-dark')).withContext('dark button').not.toBeNull();
  });

  it('injects base and preview stylesheets into Shadow DOM when inputs change', () => {
    const fixture = TestBed.createComponent(BrandingPreviewComponent);
    const comp = fixture.componentInstance;

    comp.baseCssHref = '/branding/rdmp/styles/style.min.css';
    comp.cssHref = '/branding/rdmp/preview/token.css';
    fixture.detectChanges();

    const host: HTMLElement = fixture.nativeElement as HTMLElement;
    const root = (host.shadowRoot as ShadowRoot);
    const links = Array.from(root.querySelectorAll('link[rel="stylesheet"]')) as HTMLLinkElement[];
    expect(links.length).toBe(2);
    expect(links[0].href).toContain('/branding/rdmp/styles/style.min.css');
    expect(links[1].href).toContain('/branding/rdmp/preview/token.css');
  });
});
