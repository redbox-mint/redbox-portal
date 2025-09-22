import { Component, ElementRef, Input, OnChanges, SimpleChanges, ViewEncapsulation, AfterViewInit, OnDestroy } from '@angular/core';
import { CommonModule } from '@angular/common';

/**
 * Shadow DOM based branding preview component.
 * Loads an external CSS (from same-origin) via <link> and renders a small preview shell.
 * CSP-friendly: no inline styles, no script execution.
 */
@Component({
  selector: 'branding-preview',
  template: `
    <div class="preview-root">
      <!-- Login/User bar -->
      <div class="header-area">
        <div class="container-fluid">
          <div class="row">
            <div class="col-md-8">
              <div class="user-menu">
                <ul>
                  <li><i class="fa fa-user"></i> Welcome User</li>
                  <li><a href="#">Logout</a></li>
                </ul>
              </div>
            </div>
            <div class="col-md-4"></div>
          </div>
        </div>
      </div>

      <!-- Branding bar -->
      <div class="site-branding-area">
        <div class="container-fluid">
          <div class="row">
            <div class="col-sm-10">
              <div class="logo" *ngIf="logoSrc; else textFallback">
                <h1><img [src]="logoSrc" alt="Logo" /></h1>
              </div>
              <ng-template #textFallback>
                <h1 class="site-title">Portal Branding</h1>
                <p class="site-subtitle">Branding subtitle</p>
              </ng-template>
            </div>
            <div class="col-sm-2"></div>
          </div>
        </div>
      </div>

      <!-- Menu bar -->
      <div class="mainmenu-area">
        <div class="container">
          <nav class="navbar navbar-expand-lg">
            <ul class="nav navbar-nav d-flex">
              <li><a href="#">Home</a></li>
              <li><a href="#">Search</a></li>
              <li class="active"><a class="active" href="#">Workspaces</a></li>
              <!-- Sample dropdown (shown open for preview without JS) -->
              <li class="dropdown show">
                <a class="dropdown-toggle" href="#" data-bs-toggle="dropdown" aria-expanded="true">Admin</a>
                <ul class="dropdown-menu show">
                  <li><a class="dropdown-item" href="#">Users</a></li>
                  <li><a class="dropdown-item active" href="#">Roles</a></li>
                  <li><a class="dropdown-item" href="#">Config</a></li>
                </ul>
              </li>
            </ul>
          </nav>
        </div>
      </div>

      <!-- Typography / Letters -->
  <div class="container-fluid mt-3">
        <h1>Heading 1</h1>
        <h2>Heading 2</h2>
        <h3>Heading 3</h3>
        <p>
          Body text example with <a href="#">link</a>. Lorem ipsum dolor sit amet, consectetur adipiscing elit.
        </p>
      </div>

      <!-- Panel and Button bar (card content moved into panel) -->
  <div class="container-fluid mt-3">
        <div class="row">
          <div class="col-md-12">
            <div class="panel panel-default">
              <div class="panel-heading">Panel Heading</div>
              <div class="panel-body">
                <p>Body content to preview surface/background and text colors.</p>
                <div class="btn-toolbar" role="toolbar">
                  <div class="btn-group me-2" role="group">
                    <button class="btn btn-primary">Primary</button>
                    <button class="btn btn-secondary">Secondary</button>
                    <button class="btn btn-success">Success</button>
                    <button class="btn btn-info">Info</button>
                    <button class="btn btn-warning">Warning</button>
                    <button class="btn btn-danger">Danger</button>
                    <button class="btn btn-light">Light</button>
                    <button class="btn btn-dark">Dark</button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      <!-- Footer -->
      <div class="footer-bottom-area navbar-bottom mt-4">
        <div class="container-fluid">
          <div class="row">
            <div class="col-md-12">
              <p class="text-center">Footer area</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  `,
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
