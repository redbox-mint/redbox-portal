import {RecordTypeModel} from './RecordTypeModel';
import {FormModel} from './FormModel';
export interface WorkflowStepModel {
    name: string;
    form: FormModel;
    config: unknown;
    starting: boolean;
    recordType: RecordTypeModel;
    hidden: boolean;
  }