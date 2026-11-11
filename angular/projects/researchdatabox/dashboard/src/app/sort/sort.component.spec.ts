import { TestBed } from '@angular/core/testing';
import { SortComponent } from './sort.component';

describe('SortComponent', () => {

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [ SortComponent ]
    })
    .compileComponents();
  });

  it('should create', () => {
    const fixture = TestBed.createComponent(SortComponent);
    const component = fixture.componentInstance;
    expect(component).toBeTruthy();
  });

  it('sortClicked should toggle sort', () => {
    const fixture = TestBed.createComponent(SortComponent);
    const component = fixture.componentInstance;
    expect(component.sort)
      .withContext('Empty at first')
      .toBe('');
    component.sortClicked();
    expect(component.sort)
      .withContext('asc after click')
      .toBe('asc');
    component.sortClicked();
    expect(component.sort)
      .withContext('desc after second click')
      .toBe('desc');
  });
  it('shows neutral sort affordance without putting aria-sort on a control', () => {
    const fixture = TestBed.createComponent(SortComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.fa-sort')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[aria-sort]')).toBeNull();
    fixture.componentRef.setInput('adminPresentation', true);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('button .fa-sort')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('[aria-sort]')).toBeNull();
  });
});
