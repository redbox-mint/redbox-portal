import { TestBed } from '@angular/core/testing';
import { BrandingPreviewComponent } from './branding-preview.component';

describe('BrandingPreviewComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [BrandingPreviewComponent],
    }).compileComponents();
  });

  it('attaches single-use preview CSS only once during initial input binding', async () => {
    const fixture = TestBed.createComponent(BrandingPreviewComponent);
    const root = (fixture.nativeElement as HTMLElement).shadowRoot!;
    const append = spyOn(root, 'appendChild').and.callThrough();
    fixture.componentRef.setInput('cssHref', 'data:text/css,:host{}');
    fixture.detectChanges();
    await Promise.resolve();
    expect(append.calls.allArgs().filter(args => args[0] instanceof HTMLLinkElement).length).toBe(1);
    fixture.destroy();
  });

  it('loads every checked-in static and variable fixture with the browser decoder', async () => {
    for (const name of ['regular', 'bold', 'italic', 'variable']) {
      const face = new FontFace('Fixture' + name, `url(/branding-font-fixtures/test-font-${name}.woff2)`);
      await face.load();
      expect(face.status).withContext(name).toBe('loaded');
    }
  });

  it('loads distinct preview bytes in Chrome and clears active typography for Default', async () => {
    const fixture = TestBed.createComponent(BrandingPreviewComponent);
    fixture.detectChanges();
    const host = fixture.nativeElement as HTMLElement;
    const active = new FontFace('ReDBox Brand Typeface', 'url(/branding-font-fixtures/test-font-bold.woff2)');
    document.fonts.add(active);
    await active.load();
    document.documentElement.style.setProperty('--rb-brand-font-family', "'ReDBox Brand Typeface'");
    const urls: string[] = [];
    try {
      for (const name of ['regular', 'italic']) {
        const fontUrl = new URL('/branding-font-fixtures/test-font-' + name + '.woff2', location.href).href;
        const css = `@font-face { font-family: 'ReDBox Brand Typeface'; src: url('${fontUrl}') format('woff2'); font-weight:400; font-style:normal; }
          :host { --rb-brand-font-family:'ReDBox Brand Typeface'; }
          .preview-sample-regular { font-family:var(--rb-brand-font-family); font-size:40px; }`;
        const url = URL.createObjectURL(new Blob([css], { type: 'text/css' }));
        urls.push(url);
        host.dataset['fontStatus'] = '';
        fixture.componentRef.setInput('cssHref', url);
        fixture.detectChanges();
        await new Promise<void>((resolve, reject) => {
          const deadline = Date.now() + 5000;
          const poll = () =>
            host.dataset['fontStatus'] === 'loaded'
              ? resolve()
              : Date.now() > deadline
                ? reject(new Error('Font did not load'))
                : setTimeout(poll, 10);
          poll();
        });
        const sample = host.shadowRoot!.querySelector('.preview-sample-regular') as HTMLElement;
        const family = getComputedStyle(sample).fontFamily;
        expect(family).toContain('BrandingPreview');
        expect(family).not.toContain('ReDBox Brand Typeface');
        const alias = family.split(',')[0].replace(/['"]/g, '').trim();
        const registered: FontFace[] = [];
        document.fonts.forEach(face => {
          if (face.family === alias) registered.push(face);
        });
        expect(registered.length).toBe(1);
        expect(registered[0].status).toBe('loaded');
        const reference = new FontFace('Reference' + name, `url('${fontUrl}')`);
        document.fonts.add(reference);
        await reference.load();
        const context = document.createElement('canvas').getContext('2d')!;
        context.font = `40px '${alias}'`;
        const actual = context.measureText('iiiiMMMMwwww').width;
        context.font = `40px 'Reference${name}'`;
        expect(actual).toBeCloseTo(context.measureText('iiiiMMMMwwww').width, 3);
        context.font = '40px monospace';
        expect(actual).not.toBeCloseTo(context.measureText('iiiiMMMMwwww').width, 1);
        document.fonts.delete(reference);
      }
      fixture.componentRef.setInput('cssHref', null);
      fixture.detectChanges();
      expect(getComputedStyle(host).getPropertyValue('--rb-brand-font-family').trim()).toBe('');
      expect(getComputedStyle(host).fontFamily).not.toContain('ReDBox Brand Typeface');
    } finally {
      fixture.destroy();
      document.fonts.delete(active);
      document.documentElement.style.removeProperty('--rb-brand-font-family');
      urls.forEach(url => URL.revokeObjectURL(url));
    }
  });

  it('should create and render contextual buttons including Light/Dark', () => {
    const fixture = TestBed.createComponent(BrandingPreviewComponent);
    const comp = fixture.componentInstance;
    fixture.detectChanges();

    const host: HTMLElement = fixture.nativeElement as HTMLElement;
    const root = host.shadowRoot as ShadowRoot;
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
    const root = host.shadowRoot as ShadowRoot;
    const links = Array.from(root.querySelectorAll('link[rel="stylesheet"]')) as HTMLLinkElement[];
    expect(links.length).toBe(2);
    expect(links[0].href).toContain('/branding/rdmp/styles/style.min.css');
    expect(links[1].href).toContain('/branding/rdmp/preview/token.css');
  });
});
