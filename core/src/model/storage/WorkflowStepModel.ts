import {RecordTypeModel} from './RecordTypeModel';
import {FormModel} from './FormModel';
export interface WorkflowStepModel {
    name: string;
    form: FormModel;
    config: any;
    starting: boolean;
    recordType: RecordTypeModel;
    hidden: boolean;
  }