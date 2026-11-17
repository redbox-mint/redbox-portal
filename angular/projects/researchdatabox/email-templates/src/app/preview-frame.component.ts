import { Component, Input, OnChanges, inject } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
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
  const preformatted: string[] = [];
  let marker = '\uE000';
  while (html.includes(marker)) marker += '\uE000';
  const walk = (node: Node): void => {
    if (node.nodeType === Node.TEXT_NODE) {
      out.push((node.textContent ?? '').replace(/\s+/g, ' '));
      return;
    }
    if (!(node instanceof Element)) {
      return;
    }
    if (node.tagName === 'PRE') {
      const index = preformatted.push(node.textContent ?? '') - 1;
      out.push(`\n${marker}${index}${marker}\n`);
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
  let result = out
    .join('')
    .split('\n')
    .map(line => line.trim())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
  preformatted.forEach((text, i) => { result = result.replace(`${marker}${i}${marker}`, () => text); });
  return result;
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
      @if (html !== null && mode === 'rendered' && frameSrc) {
        <div class="et-preview-canvas">
          <iframe
            class="et-preview-frame"
            sandbox=""
            referrerpolicy="no-referrer"
            [title]="'email-templates-preview-frame-title' | i18next"
            [src]="frameSrc"
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

  html: string | null = null;
  text = '';
  frameSrc: SafeResourceUrl | null = null;

  ngOnChanges(): void {
    const preview = this.preview;
    this.html = typeof preview?.html === 'string' ? preview.html : null;
    if (this.html !== null) {
      this.text = this.mode === 'text' ? htmlToText(this.html) : '';
      // Trust only the server-issued same-origin route, never HTML or a caller URL.
      const url = preview?.frameUrl;
      this.frameSrc = url && /^\/(?:[^/?#]+\/)*app\/email-templates\/preview-frame\/[\w-]{43}$/.test(url)
        ? this.sanitizer.bypassSecurityTrustResourceUrl(url) : null;
    } else {
      this.text = preview?.text ?? '';
    }
  }

}
