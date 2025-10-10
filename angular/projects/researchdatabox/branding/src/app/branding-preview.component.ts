import { Component, ElementRef, Input, OnChanges, SimpleChanges, ViewEncapsulation, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Shadow DOM based branding preview component.
 * Loads an external CSS (from same-origin) via <link> and renders a small preview shell.
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
      // Only apply if view is initialized (shadow root exists)
      if (this.host?.nativeElement?.shadowRoot) {
        this.applyStylesheets(this.baseCssHref || undefined, this.cssHref || undefined);
      }
    }
  }

  ngAfterViewInit(): void {
    // Guard against missing or non-shadow-capable host element
    if (!this.host?.nativeElement?.shadowRoot) {
      return; // Bail out of setup in SSR or non-shadow environments
    }

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
    const root = this.host?.nativeElement?.shadowRoot as ShadowRoot | null;
    if (root && this.clickListener) {
      root.removeEventListener('click', this.clickListener);
    }
  }

  private applyStylesheets(baseHref?: string, previewHref?: string) {
    // Guard against missing host element or non-shadow-capable environment
    if (!this.host?.nativeElement) {
      return; // Skip stylesheet attachment in SSR or invalid state
    }

    let root: ShadowRoot | null = null;
    
    if (this.host.nativeElement.shadowRoot) {
      root = this.host.nativeElement.shadowRoot;
    } else if (this.host.nativeElement.attachShadow) {
      // Only call attachShadow if the method exists (not in SSR)
      root = this.host.nativeElement.attachShadow({ mode: 'open' });
    } else {
      return; // Skip if shadow DOM is not supported
    }

    // Additional null check for TypeScript safety
    if (!root) {
      return;
    }

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
