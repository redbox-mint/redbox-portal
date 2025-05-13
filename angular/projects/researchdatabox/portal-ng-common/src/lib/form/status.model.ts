/**
 * The status of a component.
 */
export enum FormFieldComponentStatus {
  INIT = 'INIT',
  READY = 'READY',
  BUSY = 'BUSY',
  ERROR = 'ERROR'
}
/**
 * The status of a form.
 */
export enum FormStatus {
  INIT = 'INIT',
  READY = 'READY',
  SAVING = 'SAVING',
  VALIDATION_ERROR = 'VALIDATION_ERROR',
  LOAD_ERROR = 'LOAD_ERROR',
}