import type { SailsConfig } from "redbox-core-types";

/**
 * THIS FILE WAS ADDED AUTOMATICALLY by the Sails 1.0 app migration tool.
 * The original file was backed up as `config/globals-old.js.txt`
 */

 const globalsConfig: SailsConfig["globals"] = {

   _: require('lodash'),

   async: require('async'),

   models: true,

   sails: true

 };

module.exports.globals = globalsConfig;
