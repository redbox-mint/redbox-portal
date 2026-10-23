import { LegacyRaid } from '../compat/sails/raid';
export namespace Services {
  export class Raid extends LegacyRaid {}
}
declare global {
  let RaidService: Services.Raid;
}
