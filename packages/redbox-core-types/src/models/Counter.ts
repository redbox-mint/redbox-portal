import '../../sails';
import { JsonMap } from './types';

export interface CounterAttributes {
  branding?: string | number;
  name: string;
  value?: number;
}

export interface CounterWaterlineModel extends Sails.Model {
  attributes: CounterAttributes;
}

declare global {
  var Counter: CounterWaterlineModel;
}
