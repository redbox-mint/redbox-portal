import type { SailsConfig } from "redbox-core-types";

const redboxToCkanConfig: SailsConfig["redboxToCkan"] = {
  'urlBase': "http://localhost:1500",
  'ckan': {
    'urlBase': "http://203.101.227.135:5000",
    'apiKey': "0190b9e6-7ba1-432e-a5af-8218e416bacb",
    'ownerOrgId': 'qcif'
  }
}

module.exports.redboxToCkan = redboxToCkanConfig;
