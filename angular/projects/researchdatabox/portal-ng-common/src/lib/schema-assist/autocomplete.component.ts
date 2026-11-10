import { Component, Inject, Input, OnChanges, OnDestroy, SimpleChanges } from '@angular/core';
import { I18NextPipe } from '../i18next.pipe';
import { TranslationService } from '../translation.service';
import { caretCoordinates } from './caret-coordinates';
import {
  CompletionItem,
  CompletionQuery,
  CompletionSource,
  completionEdit,
  completionItems,
  completionQuery,
  pathCompletionQuery,
  pathCompletionEdit,
} from './template-completion';

type TextControl = HTMLTextAreaElement | HTMLInputElement;

const PANEL_WIDTH = 360;
const PANEL_MAX_HEIGHT = 300;
const NAVIGATION_KEYS = ['ArrowLeft', 'ArrowRight', 'Home', 'End', 'PageUp', 'PageDown'];
let nextId = 0;

/**
 * Suggestion popover for Handlebars paths, attached to a native text control.
 * The control keeps focus and its own handlers: the popover only reads the
 * value and caret, and accepting a suggestion is one `setRangeText` plus one
 * `input` event, so the host's debounce, autosave and gutter logic run as for
 * typing. Options are referenced with `aria-activedescendant`.
 */
@Component({
  selector: 'rb-field-autocomplete, email-templates-autocomplete',
  standalone: true,
  imports: [I18NextPipe],
  template: `
    <div class="visually-hidden" role="status" aria-live="polite">{{ announcement }}</div>
    @if (open) {
      <div
        class="et-ac"
        [class.et-ac-above]="above"
        [style.top.px]="top"
        [style.left.px]="left"
        (mousedown)="$event.preventDefault()"
      >
        @if (parent) {
          <div class="et-ac-context" aria-hidden="true">{{ parent }}</div>
        }
        <ul
          class="et-ac-list"
          role="listbox"
          [id]="listboxId"
          [attr.aria-label]="translationPrefix + '-ac-label' | i18next"
        >
          @for (item of items; track item.kind + ':' + item.value; let i = $index) {
            <li
              role="option"
              class="et-ac-option"
              [id]="optionId(i)"
              [class.active]="i === active"
              [attr.aria-selected]="i === active"
              (mousemove)="hover(i)"
              (click)="accept(i)"
            >
              <span class="et-ac-label"
                ><span class="et-ac-match">{{ item.label.slice(0, matchLength(item)) }}</span
                >{{ item.label.slice(matchLength(item)) }}</span
              >
              <span class="et-ac-title">{{ item.title || '' }}</span>
              @if (item.type !== 'unknown') {
                <span class="et-ac-type" [class.et-ac-type-helper]="item.kind === 'helper'">{{ item.type }}</span>
              }
              @if (item.container) {
                <i class="fa-solid fa-chevron-right et-ac-more" aria-hidden="true"></i>
              }
            </li>
          }
        </ul>
        <div class="et-ac-hint" aria-hidden="true">{{ translationPrefix + '-ac-hint' | i18next }}</div>
      </div>
    }
  `,
  styleUrls: ['./autocomplete.component.scss'],
})
export class AutocompleteComponent implements OnChanges, OnDestroy {
  @Input({ required: true }) target!: TextControl;
  @Input() mode: 'template' | 'path' = 'template';
  @Input() translationPrefix = 'schema-assist';
  @Input() source: CompletionSource | null = null;

  readonly listboxId = `et-ac-${++nextId}`;
  open = false;
  items: CompletionItem[] = [];
  active = 0;
  query: CompletionQuery | null = null;
  parent = '';
  top = 0;
  left = 0;
  above = false;
  announcement = '';

  private attached: TextControl | null = null;
  /** Escape keeps the popover closed until the caret leaves that token. */
  private dismissedAt: number | null = null;
  private dismissedValue: string | null = null;
  private partial = '';

  constructor(@Inject(TranslationService) private i18n: TranslationService) {}

  ngOnChanges(changes: SimpleChanges): void {
    if (changes['target']) {
      this.detach();
      this.attach();
    }
    if (changes['source'] && this.open) this.update();
  }

  ngOnDestroy(): void {
    this.detach();
  }

  optionId(index: number): string {
    return `${this.listboxId}-option-${index}`;
  }

  /** Pointer movement only: content scrolling under a still pointer must not change the choice. */
  hover(index: number): void {
    if (index === this.active) return;
    this.active = index;
    this.sync();
  }

  matchLength(item: CompletionItem): number {
    return item.label.toLowerCase().startsWith(this.partial) ? this.partial.length : 0;
  }

  /** Recompute suggestions from the control's current value and caret. */
  update(force = false): void {
    const control = this.attached;
    if (
      !control ||
      !this.source ||
      control.readOnly ||
      control.disabled ||
      control.selectionStart !== control.selectionEnd
    ) {
      this.close();
      return;
    }
    const caret = control.selectionStart ?? 0;
    const query =
      this.mode === 'path'
        ? pathCompletionQuery(control.value, caret)
        : completionQuery(control.value, caret, this.source.helpers);
    if (!query) {
      this.dismissedAt = null;
      this.close();
      return;
    }
    if (
      !force &&
      this.dismissedAt === query.start &&
      (this.mode === 'template' || this.dismissedValue === control.value)
    ) {
      this.close();
      return;
    }
    this.dismissedAt = null;
    const items = completionItems(query, this.source);
    if (!items.length) {
      this.close();
      return;
    }
    const previous = this.open ? this.items[this.active] : undefined;
    const keep = previous ? items.findIndex(item => item.kind === previous.kind && item.value === previous.value) : -1;
    const countChanged = !this.open || items.length !== this.items.length;
    this.query = query;
    this.items = items;
    this.active = keep >= 0 ? keep : 0;
    const prefix = query.prefix.replace(/^@root\./, '').replace(/\//g, '.');
    const dot = prefix.lastIndexOf('.');
    this.parent = dot < 0 ? '' : prefix.slice(0, dot);
    this.partial = prefix.slice(dot + 1).toLowerCase();
    if (!this.position()) {
      this.close();
      return;
    }
    this.open = true;
    this.sync();
    if (countChanged)
      this.announcement = this.i18n.t(this.translationPrefix + '-ac-count', { count: items.length }) as string;
  }

  close(): void {
    if (!this.open && !this.query) return;
    this.open = false;
    this.query = null;
    this.items = [];
    this.announcement = '';
    this.sync();
  }

  accept(index = this.active): void {
    const control = this.attached;
    const item = this.items[index];
    if (!control || !item || !this.query || control.readOnly) return;
    const edit =
      this.mode === 'path'
        ? pathCompletionEdit(this.query, item, this.source?.pathInsertion)
        : completionEdit(control.value, this.query, item, this.source?.blockScaffold);
    // A finished path stays closed; objects and helpers reopen for what comes next.
    this.dismissedAt = item.container || item.kind === 'helper' ? null : edit.start;
    control.setRangeText(edit.text, edit.start, edit.end, 'end');
    if (edit.selection) control.setSelectionRange(edit.start + edit.selection.start, edit.start + edit.selection.end);
    this.dismissedValue = control.value;
    // One input event: the host handles it exactly like typed text.
    control.dispatchEvent(new Event('input', { bubbles: true }));
  }

  private move(step: number): void {
    this.active = (this.active + step + this.items.length) % this.items.length;
    this.sync();
    const id = this.optionId(this.active);
    requestAnimationFrame(() => this.attached?.ownerDocument.getElementById(id)?.scrollIntoView({ block: 'nearest' }));
  }

  private onInput = (event: Event): void => {
    if ((event as InputEvent).isComposing) return;
    this.update();
  };

  private onKeydown = (raw: Event): void => {
    const event = raw as KeyboardEvent;
    if (event.isComposing) return;
    if (!this.open) {
      if (event.key === ' ' && event.ctrlKey) {
        event.preventDefault();
        this.update(true);
      }
      return;
    }
    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault();
      this.move(event.key === 'ArrowDown' ? 1 : -1);
    } else if ((event.key === 'Enter' || event.key === 'Tab') && !event.shiftKey && !event.altKey) {
      event.preventDefault();
      this.accept();
    } else if (event.key === 'Escape') {
      event.preventDefault();
      event.stopPropagation();
      this.dismissedAt = this.query?.start ?? null;
      this.dismissedValue = this.attached?.value ?? null;
      this.close();
    }
  };

  private onKeyup = (event: Event): void => {
    if (this.open && NAVIGATION_KEYS.includes((event as KeyboardEvent).key)) this.update();
  };

  private onPointer = (): void => {
    if (this.open) this.update();
  };

  private onBlur = (): void => this.close();

  private onReposition = (): void => {
    if (this.open && !this.position()) this.close();
  };

  /** Anchor below the start of the token being completed; flip above near the viewport edge. */
  private position(): boolean {
    const control = this.attached;
    if (!control || !this.query) return false;
    const view = control.ownerDocument.defaultView!;
    const caret = caretCoordinates(control, this.query.start);
    const rect = control.getBoundingClientRect();
    const caretTop = rect.top + caret.top - control.scrollTop;
    if (caretTop + caret.height < rect.top || caretTop > rect.bottom) return false;
    const left = rect.left + caret.left - control.scrollLeft;
    this.left = Math.round(Math.max(8, Math.min(left - 6, view.innerWidth - PANEL_WIDTH - 8)));
    const below = caretTop + caret.height + 4;
    this.above = below + PANEL_MAX_HEIGHT > view.innerHeight - 8 && caretTop - PANEL_MAX_HEIGHT > 8;
    this.top = Math.round(this.above ? caretTop - 4 : below);
    return true;
  }

  private sync(): void {
    const control = this.attached;
    if (!control) return;
    const set = (name: string, value: string | null) =>
      value === null ? control.removeAttribute(name) : control.setAttribute(name, value);
    set('aria-controls', this.open ? this.listboxId : null);
    set('aria-activedescendant', this.open ? this.optionId(this.active) : null);
    if (control.tagName === 'INPUT') set('aria-expanded', this.open ? 'true' : 'false');
  }

  private attach(): void {
    const control = this.target;
    if (!control) return;
    this.attached = control;
    control.setAttribute('aria-autocomplete', 'list');
    if (control.tagName === 'INPUT') control.setAttribute('role', 'combobox');
    control.addEventListener('input', this.onInput);
    control.addEventListener('keydown', this.onKeydown);
    control.addEventListener('keyup', this.onKeyup);
    control.addEventListener('click', this.onPointer);
    control.addEventListener('blur', this.onBlur);
    control.addEventListener('scroll', this.onReposition);
    const view = control.ownerDocument.defaultView;
    view?.addEventListener('scroll', this.onReposition, true);
    view?.addEventListener('resize', this.onReposition);
    this.sync();
  }

  private detach(): void {
    const control = this.attached;
    if (!control) return;
    this.close();
    control.removeEventListener('input', this.onInput);
    control.removeEventListener('keydown', this.onKeydown);
    control.removeEventListener('keyup', this.onKeyup);
    control.removeEventListener('click', this.onPointer);
    control.removeEventListener('blur', this.onBlur);
    control.removeEventListener('scroll', this.onReposition);
    const view = control.ownerDocument.defaultView;
    view?.removeEventListener('scroll', this.onReposition, true);
    view?.removeEventListener('resize', this.onReposition);
    for (const name of ['aria-autocomplete', 'aria-controls', 'aria-activedescendant', 'aria-expanded'])
      control.removeAttribute(name);
    if (control.tagName === 'INPUT') control.removeAttribute('role');
    this.attached = null;
  }
}
