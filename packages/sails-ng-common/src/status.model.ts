/**
 * The status of a component.
 */
export enum FormFieldComponentStatus {
  INIT = "INIT",
  INIT_VIEW_READY = "INIT_VIEW_READY", // Indicates the view has been initialized and ready for DOM manipulations
  READY = "READY",
  BUSY = "BUSY",
  ERROR = "ERROR",
}
/**
 * The status of a form.
 */
export enum FormStatus {
  INIT = "INIT",
  READY = "READY",
  SAVING = "SAVING",
  VALIDATION_ERROR = "VALIDATION_ERROR",
  LOAD_ERROR = "LOAD_ERROR",
  VALIDATION_PENDING = "VALIDATION_PENDING",
}
