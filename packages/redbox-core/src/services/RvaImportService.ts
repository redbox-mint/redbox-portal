import { LegacyRvaImport } from '../compat/sails/rvaImport';
export namespace Services {
  export class RvaImport extends LegacyRvaImport {}
}
declare global {
  let RvaImportService: Services.RvaImport;
}
