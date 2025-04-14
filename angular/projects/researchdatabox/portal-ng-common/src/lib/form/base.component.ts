import { ComponentConfig } from './config.model';
/**
 * Base class for a field component. 
 * 
 * Notes:
 *  - No 'field' property to enforce type safety, i.e. avoid `any`
 * 
 */
export abstract class FieldComponent {
  public config?: ComponentConfig<any>;
}