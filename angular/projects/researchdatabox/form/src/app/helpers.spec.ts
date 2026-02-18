// import {ComponentHarness, ContentContainerComponentHarness} from "@angular/cdk/testing";
import { TestBed } from "@angular/core/testing";
import { FormComponent } from "./form.component";
import {
  ConfigService,
  getStubConfigService,
  getStubTranslationService,
  LoggerService,
  RedboxPortalCoreModule,
  TranslationService,
  UtilityService
} from '@researchdatabox/portal-ng-common';
import { ReactiveFormsModule } from "@angular/forms";
import { APP_BASE_HREF, CommonModule } from "@angular/common";
import { BrowserModule, Title } from "@angular/platform-browser";
import { I18NextPipe, provideI18Next } from "angular-i18next";
import { FormService } from "./form.service";
import { FormConfigFrame, formValidatorsSharedDefinitions } from "@researchdatabox/sails-ng-common";
import { DefaultLayoutComponent } from "./component/default-layout.component";
import { InlineLayoutComponent } from "./component/inline-layout.component";
import { FormBaseWrapperComponent } from "./component/base-wrapper.component";
import { FormBaseWrapperDirective } from "./component/base-wrapper.directive";
import { provideHttpClient } from "@angular/common/http";
import { provideHttpClientTesting } from "@angular/common/http/testing";
import { provideFormFeature } from './form-state/providers';
import { provideStore } from '@ngrx/store';
import { provideEffects } from '@ngrx/effects';
import { FormStateFacade } from './form-state/facade/form-state.facade';
import { FormComponentEventBus } from './form-state/events/form-component-event-bus.service';
import { FormComponentFocusRequestCoordinator } from './form-state/events/form-component-focus-request-coordinator.service';
import { TiptapEditorDirective } from "ngx-tiptap";

// provide to test the same way as provided to browser
(window as any).redboxClientScript = { formValidatorDefinitions: formValidatorsSharedDefinitions };

export interface FormComponentProps {
  oid: string;
  recordType: string;
  editMode: boolean;
  formName: string;
  downloadAndCreateOnInit: boolean;
}

export async function createFormAndWaitForReady(formConfig: FormConfigFrame, formComponentProps?: FormComponentProps) {
  console.log('createFormAndWaitForReady - starting');
  // Set up the basic angular testing requirements.
  const fixture = TestBed.createComponent(FormComponent);
  const formComponent = fixture.componentInstance;

  // set the attributes on the nativeElement
  // this is necessary to properly initialise the form component
  formComponentProps = Object.assign({}, {
    oid: `oid-generated-${Date.now()}`,
    recordType: 'rdmp',
    editMode: false,
    formName: 'default-1.0-draft',
    downloadAndCreateOnInit: false,
  }, formComponentProps);

  // Set the form component to not download the form config on init.
  // Each test will provide a form config.
  formComponent.downloadAndCreateOnInit.set(formComponentProps['downloadAndCreateOnInit']);

  // Set the form component properties needed for initialisation.
  formComponent.oid.set(formComponentProps['oid']);
  formComponent.recordType.set(formComponentProps['recordType']);
  formComponent.editMode.set(formComponentProps['editMode']);
  formComponent.formName.set(formComponentProps['formName']);

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
    componentDefinitions: formConfig?.componentDefinitions ? formConfig?.componentDefinitions[0] : undefined
  }
}

export interface CreateTestbedModuleArgs {
  declarations?: Record<string, any>;
  providers?: Record<string, any>;
  imports?: Record<string, any>;
}

async function createTestBedModuleConfig(defaults: Record<string, any>, custom: Record<string, any>) {
  const result: any[] = [];
  const merged = Object.assign({}, defaults, custom);
  const includedKeys: string[] = [];
  Object.entries(merged).forEach(([key, value]) => {
    if (key && value) {
      // Add the value to the array if both the key and value exist.
      // This allows for removing items from the defaults by adding an entry with the same key and null value.
      includedKeys.push(key);
      result.push(value);
    }
  });
  console.log(`createTestBedModuleConfig defaults ${Object.keys(defaults)} custom ${Object.keys(custom)} result ${includedKeys}`);
  return result;
}

export async function createTestbedModule(testConfig: CreateTestbedModuleArgs) {
  const configService = getStubConfigService();
  const translationService = getStubTranslationService();
  await TestBed.configureTestingModule({
    declarations: await createTestBedModuleConfig({
      "DefaultLayoutComponent": DefaultLayoutComponent,
      "InlineLayoutComponent": InlineLayoutComponent,
      "FormBaseWrapperComponent": FormBaseWrapperComponent,
      "FormBaseWrapperDirective": FormBaseWrapperDirective,
      "FormComponent": FormComponent,
    }, testConfig.declarations ?? {}),
    imports: await createTestBedModuleConfig({
      "CommonModule": CommonModule,
      "BrowserModule": BrowserModule,
      "ReactiveFormsModule": ReactiveFormsModule,
      "RedboxPortalCoreModule": RedboxPortalCoreModule,
      "I18NextPipe": I18NextPipe,
      "TiptapEditorDirective": TiptapEditorDirective,
    }, testConfig.imports ?? {}),
    providers: await createTestBedModuleConfig({
      "APP_BASE_HREF": { provide: APP_BASE_HREF, useValue: 'http://localhost' },
      "LoggerService": LoggerService,
      "UtilityService": UtilityService,
      "TranslationService": { provide: TranslationService, useValue: translationService },
      "ConfigService": { provide: ConfigService, useValue: configService },
      "Title": Title,
      "FormService": FormService,
      "provideI18Next": provideI18Next(),
      "FormComponent": FormComponent,
      "provideHttpClient": provideHttpClient(),
      "provideHttpClientTesting": provideHttpClientTesting(),
      "provideStore": provideStore(),  // Root store provider required for NgRx
      "provideEffects": provideEffects(),  // Root effects provider required for NgRx
      "provideFormFeature": provideFormFeature(),  // Add form state providers 
      "FormStateFacade": FormStateFacade,  // Provide the facade service
      "FormComponentEventBus": FormComponentEventBus,  // Provide the event bus service
      "FormComponentFocusRequestCoordinator": FormComponentFocusRequestCoordinator,
    }, testConfig.providers ?? {}),
  }).compileComponents();
  return {
    configService: configService,
    translationService: translationService,
  }
}
