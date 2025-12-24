// Reference the entry style files, relative to the compiled js output file.
// This is needed for webpack to generate the compiled styles.
import "../../../styles/style.scss";
// import "../../../styles/default.css";
import {formValidatorsSharedDefinitions} from "@researchdatabox/sails-ng-common";

export const formValidatorDefinitions = formValidatorsSharedDefinitions;
