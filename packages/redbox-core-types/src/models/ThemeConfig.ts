import '../../sails';
import { JsonMap } from './types';

export interface ThemeConfigAttributes {
  css?: string;
  name?: string;
}

export interface ThemeConfigWaterlineModel extends Sails.Model {
  attributes: ThemeConfigAttributes;
}

declare global {
  var ThemeConfig: ThemeConfigWaterlineModel;
}
