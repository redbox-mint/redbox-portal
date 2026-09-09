import {
  Component,
  ElementRef,
  Input,
  OnChanges,
  SimpleChanges,
  ViewEncapsulation,
  AfterViewInit,
  OnDestroy,
} from '@angular/core';
import { CommonModule } from '@angular/common';

// TypeScript's DOM declarations omit the writable FontFaceSet methods.
declare global {
  interface FontFaceSet {
    add(font: FontFace): FontFaceSet;
    delete(font: FontFace): boolean;
  }
}

/**
 * Shadow DOM based branding preview component.
 * Loads an external CSS (from same-origin) via <link> and renders a small preview shell.
 */
@Component({
  selector: 'branding-preview',
  templateUrl: './branding-preview.component.html',
  styles: [
    `
      :host {
        display: block;
        max-width: 100%;
        overflow: hidden;
        font-family: 'Titillium Web', sans-serif;
        --rb-brand-font-family: initial;
      }
    `,
    `
      .mainmenu-area ul.navbar-nav li a,
      .mainmenu-area ul.navbar-nav li a:hover {
        text-decoration: none !important;
      }
    `,
    `
      .mainmenu-area ul.dropdown-menu li a.dropdown-item,
      .mainmenu-area ul.dropdown-menu li a.dropdown-item:hover {
        text-decoration: none !important;
      }
    `,
  ],
  encapsulation: ViewEncapsulation.ShadowDom,
  standalone: true,
  imports: [CommonModule],
})
export class BrandingPreviewComponent implements OnChanges, AfterViewInit, OnDestroy {
  @Input() baseCssHref?: string | null;
  @Input() cssHref?: string | null;
  @Input() logoSrc?: string | null;
  /** Unsaved local sample text from the admin component; never sent to the server. */
  @Input() sampleText?: string | null;

  private viewReady = false;
  private baseLinkEl?: HTMLLinkElement;
  private previewLinkEl?: HTMLLinkElement;
  private loadedFaces: FontFace[] = [];
  private styleGeneration = 0;
  private static nextAlias = 0;
  private clickListener?: (ev: Event) => void;

  constructor(private host: ElementRef<HTMLElement>) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['baseCssHref'] || changes['cssHref']) {
      // Only apply if view is initialized (shadow root exists)
      if (this.viewReady && this.host?.nativeElement?.shadowRoot) {
        this.applyStylesheets(this.baseCssHref || undefined, this.cssHref || undefined);
      }
    }
  }

  ngAfterViewInit(): void {
    // Guard against missing or non-shadow-capable host element
    if (!this.host?.nativeElement?.shadowRoot) {
      return; // Bail out of setup in SSR or non-shadow environments
    }

    this.viewReady = true;
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
    this.clearFonts();
    const root = this.host?.nativeElement?.shadowRoot as ShadowRoot | null;
    if (root && this.clickListener) {
      root.removeEventListener('click', this.clickListener);
    }
  }

  private clearFonts(): void {
    this.styleGeneration++;
    for (const face of this.loadedFaces) document.fonts.delete(face);
    this.loadedFaces = [];
    this.host.nativeElement.style.setProperty('--rb-brand-font-family', 'initial');
  }

  /** Shadow-root @font-face rules do not register fonts in Chrome. Register
   * each preview under its own alias so active and historical bytes cannot win
   * family matching for this preview. Never fetch the single-use CSS twice. */
  private async loadPreviewFonts(link: HTMLLinkElement, generation: number): Promise<void> {
    if (generation !== this.styleGeneration || !link.sheet) return;
    const alias = `BrandingPreview${++BrandingPreviewComponent.nextAlias}`;
    const faces: FontFace[] = [];
    for (const rule of Array.from(link.sheet.cssRules)) {
      if (rule.type !== CSSRule.FONT_FACE_RULE) continue;
      const style = (rule as CSSFontFaceRule).style;
      const source = style
        .getPropertyValue('src')
        .replace(/url\(['"]?([^)'" ]+)['"]?\)/g, (_match, path: string) => `url("${new URL(path, link.href).href}")`);
      const face = new FontFace(alias, source, {
        weight: style.getPropertyValue('font-weight') || '400',
        style: style.getPropertyValue('font-style') || 'normal',
        display: 'swap',
      });
      faces.push(face);
      document.fonts.add(face);
    }
    this.loadedFaces = faces;
    if (faces.length) this.host.nativeElement.style.setProperty('--rb-brand-font-family', `'${alias}', sans-serif`);
    try {
      await Promise.all(faces.map(face => face.load()));
      if (generation === this.styleGeneration) this.host.nativeElement.dataset['fontStatus'] = 'loaded';
    } catch {
      if (generation === this.styleGeneration) this.host.nativeElement.dataset['fontStatus'] = 'error';
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

    this.clearFonts();
    const generation = this.styleGeneration;
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
      previewLink.onload = () => {
        void this.loadPreviewFonts(previewLink, generation);
      };
      root.appendChild(previewLink);
      this.previewLinkEl = previewLink;
    }
  }
}
