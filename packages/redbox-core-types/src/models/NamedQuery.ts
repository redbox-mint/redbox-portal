import '../../sails';
import { JsonMap } from './types';

export interface NamedQueryAttributes {
  brandIdFieldPath?: string;
  branding: string | number;
  collectionName: string;
  key?: string;
  mongoQuery: string;
  name: string;
  queryParams: string;
  resultObjectMapping: string;
}

export interface NamedQueryWaterlineModel extends Sails.Model {
  attributes: NamedQueryAttributes;
}

declare global {
  var NamedQuery: NamedQueryWaterlineModel;
}
