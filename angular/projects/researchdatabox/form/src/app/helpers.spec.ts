// import {ComponentHarness, ContentContainerComponentHarness} from "@angular/cdk/testing";
import {TestBed} from "@angular/core/testing";
import {FormComponent} from "./form.component";
import {
  ConfigService,
  getStubConfigService,
  getStubTranslationService,
  LoggerService,
  RedboxPortalCoreModule,
  TranslationService,
  UtilityService
} from '@researchdatabox/portal-ng-common';
import {ReactiveFormsModule} from "@angular/forms";
import {APP_BASE_HREF, CommonModule} from "@angular/common";
import {BrowserModule, Title} from "@angular/platform-browser";
import {I18NextPipe, provideI18Next} from "angular-i18next";
import {FormService} from "./form.service";
import {FormStatus, FormConfig} from "@researchdatabox/sails-ng-common";
import {DefaultLayoutComponent} from "./component/default-layout.component";
import {FormBaseWrapperComponent} from "./component/base-wrapper.component";
import {FormBaseWrapperDirective} from "./component/base-wrapper.directive";

export async function createFormAndWaitForReady(formConfig: FormConfig) {
  console.log('createFormAndWaitForReady - starting');
  // Set up the basic angular testing requirements.
  const fixture = TestBed.createComponent(FormComponent);
  const formComponent = fixture.componentInstance;

  // Set the form component to not download the form config on init.
  // Each test will provide a form config.
  formComponent.downloadAndCreateOnInit = false;

  // Turn on angular's automatic change detection.
  // This reduces the need to call fixture.detectChanges,
  // but fixture.whenStable is still required.
  fixture.autoDetectChanges();

  // Wait until changes have occurred
  // and no more changes are detected.
  await fixture.whenStable();

  // Create the form component and field components from the form config.
  await formComponent.downloadAndCreateFormComponents(formConfig);

  await fixture.whenStable();

  console.log(`createFormAndWaitForReady - finished - debugInfo: ${JSON.stringify(formComponent.getDebugInfo())} - validationErrors: ${JSON.stringify(formComponent.getValidationErrors())}`);

  return {
    fixture: fixture,
    formComponent: formComponent,
  }
}

export async function createTestbedModule(moreDeclarations: any[] = []) {
  const configService = getStubConfigService();
  const translationService = getStubTranslationService();
  await TestBed.configureTestingModule({
    declarations: [
      DefaultLayoutComponent,
      FormBaseWrapperComponent,
      FormBaseWrapperDirective,
      FormComponent,
      ...moreDeclarations,
    ],
    imports: [
      CommonModule,
      BrowserModule,
      ReactiveFormsModule,
      RedboxPortalCoreModule,
      I18NextPipe,
    ],
    providers: [
      {
        provide: APP_BASE_HREF,
        useValue: 'base'
      },
      LoggerService,
      UtilityService,
      {
        provide: TranslationService,
        useValue: translationService
      },
      {
        provide: ConfigService,
        useValue: configService
      },
      Title,
      FormService,
      provideI18Next(),
    ]
  }).compileComponents();
  return {
    configService: configService,
    translationService: translationService,
  }
}

/*
export class FormComponentHarness extends ComponentHarness {
  static hostSelector = 'redbox-form';
}

export class TextFieldComponentHarness extends ComponentHarness {
  static hostSelector = 'redbox-textfield';
}

export class RepeatableComponentHarness extends ContentContainerComponentHarness<string> {
  static hostSelector = 'redbox-form-repeatable';
}

export class GroupFieldComponentHarness extends ContentContainerComponentHarness<string> {
  static hostSelector = 'redbox-groupfield';
}
*/
