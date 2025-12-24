import type { SailsConfig } from "redbox-core-types";

//Workspace Type Definitions


const workspacetypeConfig: SailsConfig["workspacetype"] = {
  'existing-locations': {
    name: 'existing-locations', // the record type name that maps to this workspace
    label: '@existing-locations-label',
    subtitle: '@existing-locations-label',
    description: '@existing-locations-description',
    logo: '/images/blank.png'
  }
}

module.exports.workspacetype = workspacetypeConfig;
