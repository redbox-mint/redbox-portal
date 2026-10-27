import {RecordTypeModel} from './RecordTypeModel';
import {FormAttributes} from '../../persistence/rows';
export interface WorkflowStepModel {
    name: string;
    form: FormAttributes;
    config: unknown;
    starting: boolean;
    recordType: RecordTypeModel;
    hidden: boolean;
  }