import type { SailsConfig } from "redbox-core-types";

const peopleSearchConfig: SailsConfig["peopleSearch"] = {
  "orcid": "sails.services.orcidservice.searchOrcid",
  "nla": "sails.services.orcidservice.searchOrcid",
};

module.exports.peopleSearch = peopleSearchConfig;
