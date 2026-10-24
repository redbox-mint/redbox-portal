export { Services } from '../compat/sails/orcid';
import type { Services } from '../compat/sails/orcid';
declare global {
  let OrcidService: Services.Orcids;
}
