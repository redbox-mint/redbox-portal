import {createTestbedModule} from "../helpers.spec";
import {TestBed} from "@angular/core/testing";
import {RadioInputComponent} from "./radio-input.component";
import {QuestionTreeComponent} from "./question-tree.component";
import {CheckboxInputComponent} from "./checkbox-input.component";

describe('QuestionTreeComponent', () => {
  beforeEach(async () => {
    await createTestbedModule({
      declarations: {
        "RadioInputComponent": RadioInputComponent,
        "CheckboxInputComponent": CheckboxInputComponent,
      }
    });
  });
  it('should create component', () => {
    let fixture = TestBed.createComponent(QuestionTreeComponent);
    let component = fixture.componentInstance;
    expect(component).toBeDefined();
  });
});
