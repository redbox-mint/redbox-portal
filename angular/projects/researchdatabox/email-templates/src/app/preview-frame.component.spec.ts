import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CSP_NONCE } from '@angular/core';
import { TranslationService } from '@researchdatabox/portal-ng-common';
import { PreviewFrameComponent, htmlToText } from './preview-frame.component';
import { TranslationStub } from './email-templates.testing';

describe('PreviewFrameComponent', () => {
  let fixture: ComponentFixture<PreviewFrameComponent>;
  let component: PreviewFrameComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [PreviewFrameComponent],
      providers: [
        { provide: TranslationService, useClass: TranslationStub },
        { provide: CSP_NONCE, useValue: 'abc123' },
      ],
    }).compileComponents();
    fixture = TestBed.createComponent(PreviewFrameComponent);
    component = fixture.componentInstance;
  });

  function render(preview: PreviewFrameComponent['preview'], mode: 'rendered' | 'text' = 'rendered'): void {
    fixture.componentRef.setInput('preview', preview);
    fixture.componentRef.setInput('mode', mode);
    fixture.detectChanges();
  }

  it('renders HTML in a fully sandboxed iframe without scripts or same-origin access', () => {
    render({ subject: 'Hello', html: '<p>Body</p>', frameUrl: '/default/rdmp/app/email-templates/preview-frame/' + 'a'.repeat(43), sanitiserRemovals: [], diagnostics: [] });
    const iframe = fixture.nativeElement.querySelector('iframe') as HTMLIFrameElement;
    expect(iframe).toBeTruthy();
    expect(iframe.hasAttribute('sandbox')).toBeTrue();
    expect(iframe.getAttribute('sandbox')).toBe('');
    expect(iframe.sandbox.contains('allow-scripts')).toBeFalse();
    expect(iframe.sandbox.contains('allow-same-origin')).toBeFalse();
    expect(iframe.src).toContain('/app/email-templates/preview-frame/');
    expect(iframe.hasAttribute('srcdoc')).toBeFalse();
    expect(iframe.getAttribute('title')).toBe('email-templates-preview-frame-title');
    expect(fixture.nativeElement.textContent).toContain('Hello');
  });

  it('ET-07 rejects arbitrary frame URLs and never puts email HTML into srcdoc', () => {
    render({ subject: 'Hello', html: '<p>Body</p>', frameUrl: 'javascript:alert(1)', sanitiserRemovals: [], diagnostics: [] });
    expect(fixture.nativeElement.querySelector('iframe')).toBeNull();
  });

  it('does not run script even if markup reaches the frame', async () => {
    // postMessage works across origins, so this detects script execution even
    // though the sandboxed frame has an opaque origin.
    const seen: unknown[] = [];
    const listener = (event: MessageEvent) => seen.push(event.data);
    window.addEventListener('message', listener);
    render({
      subject: 'x',
      html: '<script>parent.postMessage("et-script-ran", "*")</script><img src="data:image/png;base64,AA" onerror="parent.postMessage(\'et-handler-ran\', \'*\')">',
      sanitiserRemovals: [],
      diagnostics: [],
    });
    await new Promise(resolve => setTimeout(resolve, 300));
    window.removeEventListener('message', listener);
    expect(seen).not.toContain('et-script-ran');
    expect(seen).not.toContain('et-handler-ran');
  });

  it('shows a plain-text reading of HTML in text mode', () => {
    render(
      {
        subject: 'x',
        html: '<p>Hello <b>there</b></p><p><a href="https://example.org/r">Open</a></p>',
        sanitiserRemovals: [],
        diagnostics: [],
      },
      'text'
    );
    expect(fixture.nativeElement.querySelector('iframe')).toBeNull();
    const text = (fixture.nativeElement.querySelector('pre') as HTMLElement).textContent;
    expect(text).toContain('Hello there');
    expect(text).toContain('Open <https://example.org/r>');
  });

  it('shows text-format previews as preformatted text', () => {
    render({ subject: 'x', text: 'Plain body', sanitiserRemovals: [], diagnostics: [] });
    expect(fixture.nativeElement.querySelector('iframe')).toBeNull();
    expect(fixture.nativeElement.querySelector('pre').textContent).toBe('Plain body');
  });

  it('converts lists and breaks to text', () => {
    expect(htmlToText('<ul><li>One</li><li>Two</li></ul>Line<br>Next')).toBe('• One\n• Two\nLine\nNext');
  });
  it('ET-12 preserves PRE line breaks, indentation, blank lines and repeated spaces', () => {
    expect(htmlToText('<p>Prose   spaces</p><pre>first\n    indented    spaced\n\n\nlast</pre><p>After</p>')).toBe('Prose spaces\n\nfirst\n    indented    spaced\n\n\nlast\n\nAfter');
  });

});
