import { Component } from '@angular/core';
import { ComponentFixture, fakeAsync, TestBed, tick } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { AdminAutoFilterDirective } from './admin-auto-filter.directive';

@Component({
  standalone: true,
  imports: [FormsModule, AdminAutoFilterDirective],
  template: `<form rbAdminAutoFilter (rbAdminFilter)="apply()" (ngSubmit)="apply()">
    <input name="query" type="search" [(ngModel)]="query">
    <select name="status" [(ngModel)]="status"><option value="">All</option><option value="active">Active</option></select>
    <button type="button" (click)="query = ''; apply()">Clear</button>
  </form>`
})
class Filters {
  query = '';
  status = '';
  queries: string[] = [];
  apply() { this.queries.push(this.query + ':' + this.status); }
}

describe('AdminAutoFilterDirective', () => {
  let fixture: ComponentFixture<Filters>;
  let input: HTMLInputElement;
  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [Filters] });
    fixture = TestBed.createComponent(Filters);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    input = fixture.nativeElement.querySelector('input');
  });
  function type(value: string) {
    input.value = value;
    input.dispatchEvent(new Event('input', { bubbles: true }));
  }

  it('debounces typing and applies the latest model value once', fakeAsync(() => {
    tick();
    type('old'); tick(300);
    type('latest'); tick(399);
    expect(fixture.componentInstance.queries).toEqual([]);
    tick(1);
    expect(fixture.componentInstance.queries).toEqual(['latest:']);
  }));

  it('applies Enter immediately without submitting a second request', fakeAsync(() => {
    tick(); type('instant');
    const event = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    input.dispatchEvent(event);
    expect(event.defaultPrevented).toBeTrue();
    tick(400);
    expect(fixture.componentInstance.queries).toEqual(['instant:']);
  }));

  it('applies selects immediately and cancels pending text', fakeAsync(() => {
    tick(); type('search');
    const select: HTMLSelectElement = fixture.nativeElement.querySelector('select');
    select.value = 'active';
    select.dispatchEvent(new Event('change', { bubbles: true }));
    expect(fixture.componentInstance.queries).toEqual(['search:active']);
    tick(400);
    expect(fixture.componentInstance.queries.length).toBe(1);
  }));

  it('does not apply an abandoned debounce after Clear or destruction', fakeAsync(() => {
    tick(); type('abandoned');
    fixture.nativeElement.querySelector('button').click();
    tick(400);
    expect(fixture.componentInstance.queries).toEqual([':']);
    type('destroyed');
    fixture.destroy(); tick(400);
    expect(fixture.componentInstance.queries).toEqual([':']);
  }));
});
