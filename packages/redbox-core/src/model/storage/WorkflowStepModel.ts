import {RecordTypeModel} from './RecordTypeModel';
import {FormAttributes} from '../../waterline-models/Form';
export interface WorkflowStepModel {
    name: string;
    form: FormAttributes;
    config: unknown;
    starting: boolean;
    recordType: RecordTypeModel;
    hidden: boolean;
  }