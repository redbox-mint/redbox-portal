import { Component, HostListener, OnInit, signal } from '@angular/core';
import { FormDebugStateService } from './form-debug-state.service';

@Component({
  selector: 'redbox-form-debug-panel',
  templateUrl: './form-debug-panel.component.html',
  styleUrls: ['./form-debug-panel.component.scss'],
  standalone: false
})
export class FormDebugPanelComponent implements OnInit {
  mode = signal<'dock' | 'overlay' | 'sheet'>('dock');
  panelWidth = signal<number>(560);
  private resizeInProgress = false;
  private resizeStartX = 0;
  private resizeStartWidth = 560;
  private panelOpenedAt = 0;

  constructor(public readonly debugState: FormDebugStateService) {}

  ngOnInit(): void {
    this.refreshLayoutMode();
  }

  @HostListener('window:resize')
  refreshLayoutMode(): void {
    const viewportWidth = window.innerWidth;
    if (viewportWidth >= 1280) {
      this.mode.set('dock');
      return;
    }
    if (viewportWidth >= 768) {
      this.mode.set('overlay');
      return;
    }
    this.mode.set('sheet');
  }

  @HostListener('window:keydown.escape')
  onEscapeKey(): void {
    if (!this.debugState.panelCollapsed()) {
      this.closePanel();
    }
  }

  @HostListener('window:mousemove', ['$event'])
  onResizeMove(event: MouseEvent): void {
    if (!this.resizeInProgress) {
      return;
    }
    const delta = this.resizeStartX - event.clientX;
    const maxWidth = this.getMaxResizableWidth();
    const nextWidth = Math.max(360, Math.min(maxWidth, this.resizeStartWidth + delta));
    this.panelWidth.set(nextWidth);
  }

  @HostListener('window:mouseup')
  onResizeEnd(): void {
    this.resizeInProgress = false;
  }

  setTab(tab: 'model' | 'config' | 'events'): void {
    this.debugState.activeTab.set(tab);
  }

  toggleCollapsed(): void {
    const willOpen = this.debugState.panelCollapsed();
    this.debugState.panelCollapsed.set(!this.debugState.panelCollapsed());
    if (willOpen) {
      this.panelOpenedAt = Date.now();
    }
  }

  closePanel(): void {
    this.debugState.panelCollapsed.set(true);
  }

  closePanelFromBackdrop(): void {
    if (Date.now() - this.panelOpenedAt < 250) {
      return;
    }
    this.closePanel();
  }

  startResize(event: MouseEvent): void {
    if (this.mode() === 'sheet') {
      return;
    }
    event.preventDefault();
    this.resizeInProgress = true;
    this.resizeStartX = event.clientX;
    this.resizeStartWidth = this.panelWidth();
  }

  getPanelWidthPx(): number | null {
    if (this.mode() === 'sheet') {
      return null;
    }
    return Math.min(this.panelWidth(), this.getMaxResizableWidth());
  }

  private getMaxResizableWidth(): number {
    if (this.mode() === 'overlay') {
      return Math.max(360, Math.floor(window.innerWidth * 0.88));
    }
    return Math.max(420, window.innerWidth - 120);
  }
}
