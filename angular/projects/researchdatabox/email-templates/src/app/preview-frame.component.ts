import { Component, CSP_NONCE, Input, OnChanges, inject } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { I18NextPipe } from '@researchdatabox/portal-ng-common';
import type { EmailAdminPreview } from './email-templates.model';

export type PreviewMode = 'rendered' | 'text';

const BLOCK_ELEMENTS = new Set([
  'ADDRESS',
  'ARTICLE',
  'ASIDE',
  'BLOCKQUOTE',
  'DIV',
  'DL',
  'DT',
  'DD',
  'FIGURE',
  'FOOTER',
  'H1',
  'H2',
  'H3',
  'H4',
  'H5',
  'H6',
  'HEADER',
  'HR',
  'OL',
  'P',
  'PRE',
  'SECTION',
  'TABLE',
  'TR',
  'UL',
]);

/**
 * Plain-text reading of sanitised email HTML. DOMParser documents are inert:
 * nothing is fetched or executed while we walk the tree.
 */
export function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const out: string[] = [];
  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      out.push((node.textContent ?? '').replace(/\s+/g, ' '));
      return;
    }
    if (!(node instanceof Element)) {
      return;
    }
    if (node.tagName === 'BR') {
      out.push('\n');
      return;
    }
    const block = BLOCK_ELEMENTS.has(node.tagName);
    if (block) {
      out.push('\n');
    }
    if (node.tagName === 'LI') {
      out.push('\n• ');
    }
    node.childNodes.forEach(walk);
    if (node.tagName === 'A') {
      const href = node.getAttribute('href');
      if (href && href !== node.textContent?.trim()) {
        out.push(` <${href}>`);
      }
    }
    if (node.tagName === 'TD' || node.tagName === 'TH') {
      out.push('  ');
    }
    if (block) {
      out.push('\n');
    }
  };
  doc.body.childNodes.forEach(walk);
  return out
    .join('')
    .split('\n')
    .map(line => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Renders a preview response. HTML goes into `<iframe sandbox="">`: no
 * allow-scripts and no allow-same-origin, so even markup that slipped past the
 * server sanitiser cannot run script or reach this page's origin.
 */
@Component({
  selector: 'email-templates-preview-frame',
  standalone: true,
  imports: [I18NextPipe],
  template: `
    <div class="et-preview" [class.et-preview-stale]="stale">
      <div class="et-preview-subject">
        <span class="et-preview-subject-label">{{ 'email-templates-preview-subject' | i18next }}</span>
        <span class="et-preview-subject-text">{{ preview?.subject }}</span>
      </div>
      @if (html !== null && mode === 'rendered') {
        <div class="et-preview-canvas">
          <iframe
            class="et-preview-frame"
            sandbox=""
            referrerpolicy="no-referrer"
            [title]="'email-templates-preview-frame-title' | i18next"
            [srcdoc]="srcdoc"
          ></iframe>
        </div>
      } @else {
        <pre class="et-preview-text" tabindex="0" [attr.aria-label]="'email-templates-preview-text-label' | i18next">{{
          text
        }}</pre>
      }
    </div>
  `,
  styleUrls: ['./preview-frame.component.scss'],
})
export class PreviewFrameComponent implements OnChanges {
  @Input() preview: EmailAdminPreview | null = null;
  @Input() mode: PreviewMode = 'rendered';
  /** True while a newer preview is being rendered. */
  @Input() stale = false;

  private readonly sanitizer = inject(DomSanitizer);
  private readonly nonce = inject(CSP_NONCE, { optional: true });

  html: string | null = null;
  text = '';
  srcdoc: SafeHtml = '';

  ngOnChanges(): void {
    const preview = this.preview;
    this.html = typeof preview?.html === 'string' ? preview.html : null;
    if (this.html !== null) {
      this.text = this.mode === 'text' ? htmlToText(this.html) : '';
      if (this.mode === 'rendered') {
        // Angular's [srcdoc] sanitiser would strip the email's document and
        // inline styling, so we mark it trusted. This is the only bypass in the
        // app and it is safe because: (1) the HTML is the server's output from
        // the DOMPurify `email` profile used for real sends; (2) the iframe is
        // sandbox="" (scripts disabled, opaque origin, no popups or top-level
        // navigation); and (3) srcdoc documents inherit this page's CSP.
        this.srcdoc = this.sanitizer.bypassSecurityTrustHtml(this.wrap(this.html));
      }
    } else {
      this.text = preview?.text ?? '';
    }
  }

  /** Neutral email canvas; only this wrapper style carries the page nonce. */
  private wrap(body: string): string {
    const nonce = this.nonce ? ` nonce="${this.nonce.replace(/[^A-Za-z0-9+/=_-]/g, '')}"` : '';
    return (
      '<!doctype html><html><head><meta charset="utf-8"><meta name="color-scheme" content="light">' +
      '<base target="_blank">' +
      `<style${nonce}>html{background:#fff}body{margin:0;padding:20px 24px;color:#1f2328;` +
      'font:14px/1.55 -apple-system,BlinkMacSystemFont,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;' +
      'overflow-wrap:anywhere}img{max-width:100%;height:auto}a{color:#0b57d0}</style>' +
      `</head><body>${body}</body></html>`
    );
  }
}
