import { TestBed } from '@angular/core/testing';
import { FormsModule } from '@angular/forms';
import { RecordSearchRefinerComponent } from './record-search-refiner.component';
import { RecordSearchRefiner } from '../search-models';
import { I18NextModule } from 'angular-i18next';

describe('RecordSearchRefinerComponent', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [RecordSearchRefinerComponent],
      imports: [FormsModule, I18NextModule.forRoot()],
    }).compileComponents();
  });

  it('should create the component', () => {
    const fixture = TestBed.createComponent(RecordSearchRefinerComponent);
    const component = fixture.componentInstance;
    component.refinerConfig = new RecordSearchRefiner({ name: 'test', type: 'exact', title: 'Test' });
    expect(component).toBeTruthy();
  });

  it('should not emit when value is empty', () => {
    const fixture = TestBed.createComponent(RecordSearchRefinerComponent);
    const component = fixture.componentInstance;
    component.refinerConfig = new RecordSearchRefiner({ name: 'test', type: 'exact', title: 'Test' });
    spyOn(component.onApplyFilter, 'emit');

    const event = new Event('click');
    component.applyFilter(event);

    expect(component.onApplyFilter.emit).not.toHaveBeenCalled();
  });

  it('should emit when value is present', () => {
    const fixture = TestBed.createComponent(RecordSearchRefinerComponent);
    const component = fixture.componentInstance;
    component.refinerConfig = new RecordSearchRefiner({ name: 'test', type: 'exact', title: 'Test' });
    component.refinerConfig.value = 'some value';
    spyOn(component.onApplyFilter, 'emit');

    const event = new Event('click');
    component.applyFilter(event);

    expect(component.onApplyFilter.emit).toHaveBeenCalledWith(component.refinerConfig);
  });

  it('hasValue should return false for empty refiner', () => {
    const fixture = TestBed.createComponent(RecordSearchRefinerComponent);
    const component = fixture.componentInstance;
    component.refinerConfig = new RecordSearchRefiner({ name: 'test', type: 'exact', title: 'Test' });
    expect(component.hasValue()).toBe(false);
  });

  it('hasValue should return true when refiner has value', () => {
    const fixture = TestBed.createComponent(RecordSearchRefinerComponent);
    const component = fixture.componentInstance;
    component.refinerConfig = new RecordSearchRefiner({ name: 'test', type: 'exact', title: 'Test' });
    component.refinerConfig.value = 'something';
    expect(component.hasValue()).toBe(true);
  });
});
