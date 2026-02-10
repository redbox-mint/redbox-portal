export interface FormModel {
    id?: string;
    name: string;
    customAngularApp: FormCustomAngularApp;
    fields: {
        [key: string]: unknown;
    }[];
    workflowStep: string;
    type: string;
    messages: {
        [key: string]: unknown;
    };
    requiredFieldIndicator: string;
    viewCssClasses: string;
    editCssClasses: string;
    skipValidationOnSave: boolean;
    attachmentFields: unknown;
}

export interface FormCustomAngularApp {
  appName:string;
  appSelector:string;
}