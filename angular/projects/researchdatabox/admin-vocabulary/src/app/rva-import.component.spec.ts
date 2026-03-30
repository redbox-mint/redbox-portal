import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Pipe, PipeTransform } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { RvaImportComponent } from './rva-import.component';

@Pipe({ name: 'i18next', standalone: false })
class I18NextPipeStub implements PipeTransform {
  transform(value: string): string {
    return value;
  }
}

describe('RvaImportComponent', () => {
  let fixture: ComponentFixture<RvaImportComponent>;
  let component: RvaImportComponent;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      declarations: [RvaImportComponent, I18NextPipeStub],
      imports: [FormsModule]
    }).compileComponents();

    fixture = TestBed.createComponent(RvaImportComponent);
    component = fixture.componentInstance;
  });

  it('emits trimmed rva id and clears input', () => {
    let emitted = '';
    component.importRequested.subscribe((value: string) => emitted = value);

    component.rvaId = '  rva:test  ';
    component.runImport();

    expect(emitted).toBe('rva:test');
    expect(component.rvaId).toBe('');
  });
});
