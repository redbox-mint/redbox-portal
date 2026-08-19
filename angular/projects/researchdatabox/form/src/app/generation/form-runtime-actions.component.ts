import { Component, computed, ElementRef, input, OnDestroy, QueryList, signal, ViewChildren } from '@angular/core';
import { FormRuntimeAction } from '@researchdatabox/sails-ng-common';
import { Store } from '@ngrx/store';
import { Subscription } from 'rxjs';
import { FormComponentEventBus } from '../form-state/events/form-component-event-bus.service';
import { createFormRuntimeActionInvokedEvent } from '../form-state/events/form-component-event.types';
import { selectGenerationBusy, selectGenerationState } from './state/generation.selectors';

@Component({
  selector: 'redbox-form-runtime-actions',
  template: `
    @if (orderedActions().length > 0) {
      <nav class="rb-runtime-actions" [attr.aria-label]="'generation-actions-label' | i18next">
        <div class="rb-runtime-actions__eyebrow">{{ 'generation-actions-eyebrow' | i18next }}</div>
        <div class="rb-runtime-actions__list">
          @for (action of orderedActions(); track action.id; let index = $index) {
            <button
              #actionButton
              type="button"
              class="btn btn-primary rb-runtime-actions__button"
              [disabled]="busy()"
              [attr.aria-describedby]="action.helpTextKey ? action.id + '-help' : null"
              (click)="invoke(action, index)"
            >
              @if (action.icon) { <i [class]="action.icon" aria-hidden="true"></i> }
              <span>{{ action.labelKey | i18next }}</span>
            </button>
            @if (action.helpTextKey) {
              <span class="rb-runtime-actions__help" [id]="action.id + '-help'">{{ action.helpTextKey | i18next }}</span>
            }
          }
        </div>
      </nav>
    }
  `,
  standalone: false,
})
export class FormRuntimeActionsComponent implements OnDestroy {
  readonly actions = input<FormRuntimeAction[]>([]);
  readonly orderedActions = computed(() => [...this.actions()].sort((left, right) => left.order - right.order || left.id.localeCompare(right.id)));
  readonly busy = this.store.selectSignal(selectGenerationBusy);
  private readonly lastInvokedIndex = signal<number | null>(null);
  private readonly subscriptions = new Subscription();
  @ViewChildren('actionButton') private buttons?: QueryList<ElementRef<HTMLButtonElement>>;

  constructor(
    private readonly eventBus: FormComponentEventBus,
    private readonly store: Store,
  ) {
    this.subscriptions.add(this.store.select(selectGenerationState).subscribe((state) => {
      if (state.error && this.lastInvokedIndex() !== null) {
        queueMicrotask(() => this.buttons?.get(this.lastInvokedIndex() ?? 0)?.nativeElement.focus());
        this.lastInvokedIndex.set(null);
      }
    }));
  }

  public ngOnDestroy(): void {
    this.subscriptions.unsubscribe();
  }

  public invoke(action: FormRuntimeAction, index: number): void {
    if (this.busy()) return;
    this.lastInvokedIndex.set(index);
    this.eventBus.publish(createFormRuntimeActionInvokedEvent({
      action,
      sourceId: action.id,
      origin: 'user',
      correlationId: action.id,
    }));
  }
}
