// Copyright (c) 2017 Queensland Cyber Infrastructure Foundation (http://www.qcif.edu.au/)
//
// GNU GENERAL PUBLIC LICENSE
//    Version 2, June 1991
//
// This program is free software; you can redistribute it and/or modify
// it under the terms of the GNU General Public License as published by
// the Free Software Foundation; either version 2 of the License, or
// (at your option) any later version.
//
// This program is distributed in the hope that it will be useful,
// but WITHOUT ANY WARRANTY; without even the implied warranty of
// MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
// GNU General Public License for more details.
//
// You should have received a copy of the GNU General Public License along
// with this program; if not, write to the Free Software Foundation, Inc.,
// 51 Franklin Street, Fifth Floor, Boston, MA 02110-1301 USA.

import { Observable } from 'rxjs/Rx';
import services = require('../core/CoreService.js');
import {Sails, Model} from "sails";
import * as fs from 'fs-extra';
import { resolve, basename } from 'path';

declare var sails: Sails;
declare var _;
declare var CacheEntry: Model;

export module Services {
  /**
   * Dynamic Configuration related functions...
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   *
   */
  export class Config extends services.Services.Core.Service {

    protected _exportedMethods: any = [
      'getBrand',
      'mergeHookConfig'
    ];

    public getBrand(brandName:string, configBlock:string) {
      let configVal = sails.config[configBlock][brandName];
      if (_.isUndefined(configVal)) {
        brandName = sails.config.auth.defaultBrand;
        configVal = sails.config[configBlock][brandName];
      }
      return configVal;
    }

    public mergeHookConfig(hookName:string, configMap:any=sails.config, config_dirs: string[] = ["form-config", "config"], dontMergeFields:any[] = ["fields"]) {
      const hook_root_dir = `${sails.config.appPath}/node_modules/${hookName}`;
      const hook_log_header = hookName;
      let origDontMerge = _.clone(dontMergeFields);
      const concatArrsFn = function (objValue, srcValue, key) {
        if (_.indexOf(dontMergeFields, key) != -1) {
          return srcValue;
        }
      }
      sails.log.verbose(`${hookName}::Merging configuration...`);
      _.each(config_dirs, (config_dir) => {
        config_dir = `${hook_root_dir}/${config_dir}`;
        sails.log.verbose(`${hook_log_header}::Looking at: ${config_dir}`);
        if (fs.pathExistsSync(config_dir)) {
          const files = this.walkDirSync(config_dir, []);
          sails.log.verbose(hook_log_header + "::Processing:");
          sails.log.verbose(files);
          _.each(files, (file_path) => {
            const config_file = require(file_path);
            // for overriding values...
            const hasCustomDontMerge = _.findKey(config_file, "_dontMerge");
            if (hasCustomDontMerge) {
              dontMergeFields = dontMergeFields.concat(config_file[hasCustomDontMerge]['_dontMerge']);
              _.unset(config_file[hasCustomDontMerge], "_dontMerge");
            }
            // for deleting values...
            const hasDeleteFields = _.findKey(config_file, "_delete");
            if (hasDeleteFields) {
              _.each(config_file[hasDeleteFields]['_delete'], (toDelete) => {
                _.unset(configMap[hasDeleteFields], toDelete);
              });
              _.unset(config_file[hasDeleteFields], "_delete");
            }
            _.mergeWith(configMap, config_file, concatArrsFn);
            dontMergeFields = _.clone(origDontMerge);
          });
        } else {
          sails.log.verbose(hook_log_header + "::Skipping, directory not found:" + config_dir);
        }
      });
      sails.log.verbose(`${hook_log_header}::Merging configuration...complete.`);
      sails.log.verbose(`${hook_log_header}::Merging Translation file...`);
      // language file updates ... only English for now
      // locales directory moved out of assets directory so we can safely merge
      const language_file_path = resolve("assets/locales/en/translation.json");
      const hook_language_file_path = resolve(hook_root_dir, "locales/en/translation.json");
      if (fs.pathExistsSync(language_file_path) && fs.pathExistsSync(hook_language_file_path)) {
        sails.log.verbose(hook_log_header + ":: Merging English translation file...");
        const mainTranslation = require(language_file_path);
        const hookTranslation = require(hook_language_file_path);
        _.merge(mainTranslation, hookTranslation);
        fs.writeFileSync(language_file_path, JSON.stringify(mainTranslation, null, 2));
      }
      //If assets directory exists, there must be some assets to copy over
      if(fs.pathExistsSync(`${hook_root_dir}/assets/`)) {
        sails.log.verbose(`${hook_log_header}::Copying assets...`);
        fs.copySync(`${hook_root_dir}/assets/`,"assets/");
        fs.copySync(`${hook_root_dir}/assets/`,".tmp/public/");
      }
      //If assets directory exists, there must be some assets to copy over
      if(fs.pathExistsSync(`${hook_root_dir}/views/`)) {
        sails.log.verbose(`${hook_log_header}::Copying views...`);
        fs.copySync(`${hook_root_dir}/views/`,"views/");
      }
      // check if the core exists when API definitions are present ...
      if (fs.pathExistsSync(`${hook_root_dir}/api`) && !fs.pathExistsSync(`${hook_root_dir}/api/core`)) {
        sails.log.verbose(`${hook_log_header}::Adding Symlink to API core...`);
        // create core services symlink if not present
        fs.ensureSymlinkSync(`${sails.config.appPath}/api/core`, `${hook_root_dir}/api/core`);
      }
      sails.log.verbose(`${hook_log_header}::Adding custom API elements...`);
      let apiDirs = ["services", "controllers"];
      _.each(apiDirs, (apiType) => {
        const files = this.walkDirSync(`${hook_root_dir}/api/${apiType}`, []);
        sails.log.verbose(`${hook_log_header}::Processing:`);
        sails.log.verbose(JSON.stringify(files));
        if (!_.isEmpty(files)) {
          _.each(files, (file) => {
            const apiDef = require(file);
            const apiElemName = _.toLower(basename(file, '.js'))
            // TODO: deal with controllers or services in nested directories
            sails[apiType][apiElemName] = apiDef;
          });
        }
      });
      sails.log.verbose(`${hook_log_header}::Adding custom API elements...completed.`);
      sails.log.verbose(`${hookName}::Merge complete.`);
    }

    private walkDirSync(dir:string, filelist:any[] = []) {
      if (!fs.pathExistsSync(dir)) {
        return filelist;
      }
      try {
        var files = fs.readdirSync(dir);
        _.each(files, (file) => {
          const resolved = resolve(dir, file);
          if (fs.statSync(resolved).isDirectory()) {
            filelist = this.walkDirSync(resolved , filelist);
          } else {
            filelist.push(resolved);
          }
        });
      } catch (e) {
        sails.log.error(`Error walking directory: ${dir}`);
        sails.log.error(e)
      }
      return filelist;
    }

  }
}
module.exports = new Services.Config().exports();
