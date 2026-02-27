import { AfterViewInit, Component, ElementRef, ViewChild, effect } from '@angular/core';
import { FormDebugStateService } from './form-debug-state.service';

@Component({
  selector: 'redbox-form-debug-events-tab',
  templateUrl: './form-debug-events-tab.component.html',
  standalone: false
})
export class FormDebugEventsTabComponent implements AfterViewInit {
  @ViewChild('debugEventListContainer', { read: ElementRef, static: false })
  debugEventListContainer?: ElementRef<HTMLElement>;

  constructor(public readonly debugState: FormDebugStateService) {
    effect(() => {
      this.debugState.debugEvents();
      if (!this.debugState.debugEventAutoScroll()) {
        return;
      }
      setTimeout(() => {
        const container = this.debugEventListContainer?.nativeElement;
        if (!container) {
          return;
        }
        container.scrollTop = container.scrollHeight;
      });
    });
  }

  ngAfterViewInit(): void {}
}
