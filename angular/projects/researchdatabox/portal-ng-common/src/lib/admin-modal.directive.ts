import { AfterViewInit, booleanAttribute, Directive, ElementRef, Input, OnChanges, OnDestroy } from '@angular/core';

/** Makes every branch outside an admin dialog inert, including the portal chrome.
 * Keep CDK's trap on the dialog: it owns keyboard containment and initial focus.
 */
@Directive({ selector: '[rbAdminModal]', standalone: true })
export class AdminModalDirective implements AfterViewInit, OnChanges, OnDestroy {
  @Input({ transform: booleanAttribute }) rbAdminModal = true;
  @Input({ transform: booleanAttribute }) rbAdminModalRestoreFocus = true;
  private static locks = new Map<HTMLElement, { count: number; wasInert: boolean }>();
  private locked: HTMLElement[] = [];
  private trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
  private ready = false;

  constructor(private element: ElementRef<HTMLElement>) {}

  ngAfterViewInit(): void {
    this.ready = true;
    this.sync();
  }
  ngOnChanges(): void {
    if (this.ready) this.sync();
  }
  ngOnDestroy(): void {
    this.release();
  }

  private sync(): void {
    if (!this.rbAdminModal) {
      this.release();
      return;
    }
    if (this.locked.length) return;
    let branch = this.element.nativeElement;
    while (branch.parentElement) {
      for (const sibling of Array.from(branch.parentElement.children)) {
        if (
          sibling === branch ||
          sibling.classList.contains('cdk-focus-trap-anchor') ||
          !(sibling instanceof HTMLElement) ||
          ['SCRIPT', 'STYLE', 'LINK'].includes(sibling.tagName)
        )
          continue;
        // A template may already own this inert region; never restore its old
        // value after Angular has cleared it while closing the dialog.
        if (sibling.inert && !AdminModalDirective.locks.has(sibling)) continue;
        const lock = AdminModalDirective.locks.get(sibling) ?? { count: 0, wasInert: sibling.inert };
        lock.count++;
        AdminModalDirective.locks.set(sibling, lock);
        sibling.inert = true;
        this.locked.push(sibling);
      }
      branch = branch.parentElement;
      if (branch === document.body) break;
    }
  }

  private release(): void {
    if (!this.locked.length) return;
    for (const element of this.locked) {
      const lock = AdminModalDirective.locks.get(element)!;
      if (--lock.count === 0) {
        element.inert = lock.wasInert;
        AdminModalDirective.locks.delete(element);
      }
    }
    this.locked = [];
    const trigger = this.trigger;
    // Angular and ngx-bootstrap finish removing their inert regions on this turn.
    setTimeout(() => {
      if (this.rbAdminModalRestoreFocus && trigger?.isConnected && !trigger.closest('[inert]'))
        trigger.focus({ preventScroll: true });
    });
  }
}
