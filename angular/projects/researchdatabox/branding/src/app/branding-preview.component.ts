import { Component, ElementRef, Input, OnChanges, SimpleChanges, ViewEncapsulation, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Shadow DOM based branding preview component.
 * Loads an external CSS (from same-origin) via <link> and renders a small preview shell.
 * CSP-friendly: no inline styles, no script execution.
 */
@Component({
  selector: 'branding-preview',
  templateUrl: './branding-preview.component.html',
  styles: [
    `:host{display:block;max-width:100%;overflow:hidden}`,
    `.mainmenu-area ul.navbar-nav li a, .mainmenu-area ul.navbar-nav li a:hover { text-decoration: none !important; }`,
    `.mainmenu-area ul.dropdown-menu li a.dropdown-item, .mainmenu-area ul.dropdown-menu li a.dropdown-item:hover { text-decoration: none !important; }`
  ],
  encapsulation: ViewEncapsulation.ShadowDom,
  standalone: true,
  imports: [CommonModule]
})
export class BrandingPreviewComponent implements OnChanges, AfterViewInit, OnDestroy {
  @Input() baseCssHref?: string | null;
  @Input() cssHref?: string | null;
  @Input() logoSrc?: string | null;

  private baseLinkEl?: HTMLLinkElement;
  private previewLinkEl?: HTMLLinkElement;
  private clickListener?: (ev: Event) => void;

  constructor(private host: ElementRef<HTMLElement>) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['baseCssHref'] || changes['cssHref']) {
      this.applyStylesheets(this.baseCssHref || undefined, this.cssHref || undefined);
    }
  }

  ngAfterViewInit(): void {
    const root = this.host.nativeElement.shadowRoot as ShadowRoot;
    // Ensure stylesheets are attached on first render even if inputs were bound before view init
    this.applyStylesheets(this.baseCssHref || undefined, this.cssHref || undefined);
    // Delegate clicks inside the shadow root to prevent navigation
    this.clickListener = (ev: Event) => {
      // Find an anchor in the composed path (works across shadow boundaries)
      const path = (ev as any).composedPath?.() || [];
      let anchor: any = path.find((el: any) => el && el.tagName === 'A');
      if (!anchor && ev.target && (ev.target as Element).closest) {
        anchor = (ev.target as Element).closest('a');
      }
      if (anchor) {
        ev.preventDefault();
        ev.stopPropagation();
      }
    };
    root.addEventListener('click', this.clickListener);
  }

  ngOnDestroy(): void {
    const root = this.host.nativeElement.shadowRoot as ShadowRoot | null;
    if (root && this.clickListener) {
      root.removeEventListener('click', this.clickListener);
    }
  }

  private applyStylesheets(baseHref?: string, previewHref?: string) {
    const root = (this.host.nativeElement.shadowRoot || this.host.nativeElement.attachShadow({ mode: 'open' })) as ShadowRoot;
    // Remove prior links if present
    if (this.baseLinkEl && this.baseLinkEl.parentNode) {
      this.baseLinkEl.parentNode.removeChild(this.baseLinkEl);
      this.baseLinkEl = undefined;
    }
    if (this.previewLinkEl && this.previewLinkEl.parentNode) {
      this.previewLinkEl.parentNode.removeChild(this.previewLinkEl);
      this.previewLinkEl = undefined;
    }
    // Add base stylesheet first (e.g., style.min.css)
    if (baseHref) {
      const baseLink = document.createElement('link');
      baseLink.setAttribute('rel', 'stylesheet');
      baseLink.setAttribute('href', baseHref);
      root.appendChild(baseLink);
      this.baseLinkEl = baseLink;
    }
    // Then add preview/theming stylesheet to override base
    if (previewHref) {
      const previewLink = document.createElement('link');
      previewLink.setAttribute('rel', 'stylesheet');
      previewLink.setAttribute('href', previewHref);
      root.appendChild(previewLink);
      this.previewLinkEl = previewLink;
    }
  }
}
