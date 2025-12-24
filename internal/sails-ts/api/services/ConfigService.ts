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

import { Observable } from 'rxjs';
import {BrandingModel, Services as services}   from '@researchdatabox/redbox-core-types';
import {Sails, Model} from "sails";
import * as fs from 'fs-extra';
import { resolve, basename } from 'path';
import { glob } from 'fs';
declare var sails: Sails;
declare var _;

export module Services {
  /**
   * Dynamic Configuration related functions...
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   *
   */
  export class Config extends services.Core.Service {

    protected _exportedMethods: any = [
      'getBrand',
      'mergeHookConfig'
    ];

    public getBrand(brandName:string, configBlock:string) {
      const defaultBrand = _.get(sails, 'config.auth.defaultBrand', 'default');
      const resolveFromBrandingAware = (name: string) => {
        if (_.isFunction(_.get(sails, 'config.brandingAware')) && !_.isEmpty(name)) {
          const brandingConfig = sails.config.brandingAware(name);
          const configVal = _.get(brandingConfig, configBlock);
          if (!_.isUndefined(configVal)) {
            return configVal;
          }
        }
        return undefined;
      };

      let configVal = resolveFromBrandingAware(brandName);
      if (_.isUndefined(configVal)) {
        configVal = resolveFromBrandingAware(defaultBrand);
      }
      if (_.isUndefined(configVal)) {
        configVal = _.get(sails.config.brandingConfigurationDefaults, configBlock);
      }
      if (_.isUndefined(configVal)) {
        const legacyConfig = _.get(sails.config, configBlock, {});
        configVal = _.get(legacyConfig, brandName);
        if (_.isUndefined(configVal)) {
          configVal = _.get(legacyConfig, defaultBrand);
        }
      }
      return configVal;
    }

    public mergeHookConfig(hookName: string, configMap: any = sails.config, config_dirs: string[] = ["form-config", "config"], branded_app_config_dirs: string[] = ["branded-config"], dontMergeFields: any[] = ["fields"]) {
      const that = this;
      var hook_root_dir = `${sails.config.appPath}/node_modules/${hookName}`;
      var appPath = sails.config.appPath;
      // check if the app path was launched from the hook directory, e.g. when launching tests.
      if (!fs.pathExistsSync(hook_root_dir) && _.endsWith(sails.config.appPath, hookName)) {
        hook_root_dir = sails.config.appPath;
        appPath = appPath.substring(0, appPath.lastIndexOf(`/node_modules/${hookName}`));
      }
      const hook_log_header = hookName;
      let origDontMerge = _.clone(dontMergeFields);
      const concatArrsFn = function (objValue, srcValue, key, object, source, stack) {
        const dontMergeIndex = _.findIndex(dontMergeFields, (o) => { return _.isString(o) ? _.isEqual(o, key) : !_.isEmpty(o[key]) });
        if (dontMergeIndex != -1) {
          if (!_.isString(dontMergeFields[dontMergeIndex])) {
            if (dontMergeFields[key] == "this_file") {
              return srcValue;
            } else {
              return objValue;
            }
          }
          return srcValue;
        }
      }
      sails.log.verbose(`${hookName}::Merging branded app configuration...`);
      _.each(branded_app_config_dirs, (branded_app_config_dir) => {
        branded_app_config_dir = `${hook_root_dir}/${branded_app_config_dir}`;
        sails.log.verbose(`${hook_log_header}::Looking at: ${branded_app_config_dir}`);
        if (fs.pathExistsSync(branded_app_config_dir)) {
          var dirs = fs.readdirSync(branded_app_config_dir);
          _.each(dirs, (dir) => {
            if (fs.statSync(dir).isDirectory()) {
              let brandName = basename(dir)

              // init-only directory will only create config entries. Intended for initialising config in a new environment that's managed either via API or screens once live.
              const initFiles = this.walkDirSync(`${dir}/init-only`, []);
              sails.log.verbose(hook_log_header + "::Processing:");
              sails.log.verbose(initFiles);
              _.each(initFiles, (file_path) => {
                const config_file = require(file_path);
                let configKey = basename(file_path)
                AppConfigService.createConfig(brandName, configKey, config_file).then(config => { sails.log.verbose(hook_log_header + "::Configuration created:"); sails.log.verbose(config) })
                .catch(error => { sails.log.verbose(hook_log_header + "::Skipping creation of config as it already exists:"); sails.log.verbose(error) });
              });

            

          // Files in override directory are always updated (for config items without management screens)
          const overrideFiles = this.walkDirSync(`${dir}/override`, []);
          sails.log.verbose(hook_log_header + "::Processing:");
          sails.log.verbose(overrideFiles);
          _.each(overrideFiles, (file_path) => {
            const config_file = require(file_path);
            let configKey = basename(file_path)
            const brand:BrandingModel = BrandingService.getBrand(brandName);
            AppConfigService.createOrUpdateConfig(brand, configKey, config_file).then(config => {
              sails.log.verbose(hook_log_header + "::Configuration created or updated:");
              sails.log.verbose(config);
            });


          });

        } else {
          sails.log.verbose(hook_log_header + "::Skipping, Found file where we are only expecting directories:" + dir);
        }
      });
    } else {
    sails.log.verbose(hook_log_header + "::Skipping, directory not found:" + branded_app_config_dir);
  }
});
sails.log.verbose(`${hook_log_header}::Merging branded app configuration...complete.`);

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
      sails.log.verbose(`${hook_log_header}::Merging Translation files...`);
      this.mergeTranslationFiles(hook_root_dir, hook_log_header, sails.config.dontBackupCoreLanguageFilesWhenMerging);
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
      if (fs.pathExistsSync(`${appPath}/api/core`) && fs.pathExistsSync(`${hook_root_dir}/api`) && !fs.pathExistsSync(`${hook_root_dir}/api/core`)) {
        sails.log.verbose(`${hook_log_header}::Adding Symlink to API core... ${hook_root_dir}/api/core -> ${appPath}/api/core`);
        // create core services symlink if not present
        fs.ensureSymlinkSync(`${appPath}/api/core`, `${hook_root_dir}/api/core`);
      }
      sails.log.verbose(`${hook_log_header}::Adding custom API elements...`);

      let apiDirs = ["services"];
      _.each(apiDirs, (apiType) => {
        const files = this.walkDirSync(`${hook_root_dir}/api/${apiType}`, []);
        if (!sails[apiType]) {
          sails[apiType] = {};
        }
        sails.log.verbose(`${hook_log_header}::Processing '${apiType}':`);
        sails.log.verbose(JSON.stringify(files));
        if (!_.isEmpty(files)) {
          _.each(files, (file) => {
            const apiDef = require(file);
            const globalName = basename(file, '.js')
            const apiElemName = _.toLower(globalName)
            // TODO: deal with controllers or services in nested directories
            sails[apiType][apiElemName] = apiDef;
            global[globalName] = apiDef;
          });
        }
      });

      let controllerDirs = ["controllers"];
      _.each(controllerDirs, (apiType) => {
        const files = that.walkDirSync(`${hook_root_dir}/api/${apiType}`, []);
        sails.log.verbose(`${hook_log_header}::Processing '${apiType}':`);
        sails.log.verbose(JSON.stringify(files));
        if (!_.isEmpty(files)) {
          _.each(files, (file) => {
            const apiDef = require(file);
            const baseName = basename(file, '.js');
            const controllerName = basename(baseName, 'Controller')
            // sails[apiType][apiElemName] = apiDef;
            if (_.isEmpty(sails.config.controllers)) {
              sails.config.controllers = {};
            }
            if (_.isEmpty(sails.config.controllers.moduleDefinitions)) {
              sails.config.controllers.moduleDefinitions = {};
            }
            _.forOwn(apiDef, (methodFn, methodName) => {
              if (!_.startsWith(methodName, '_') && _.isFunction(methodFn)) {
                sails.log.verbose(`Setting: ${controllerName}/${methodName}`);
                sails.config.controllers.moduleDefinitions[`${controllerName}/${methodName}`] = methodFn;
              }
            });
          });
        }
      });
      // for simple copying of API elements...
      const apiCopyDirs = ['models', 'policies', 'responses'];
      for (let apiCopyDir of apiCopyDirs) {
        const apiCopyFiles = this.walkDirSync(`${hook_root_dir}/api/${apiCopyDir}`, []);
        if (!_.isEmpty(apiCopyFiles)) {
          for (let apiCopyFile of apiCopyFiles) {
            const dest = `${appPath}/api/${apiCopyDir}/${basename(apiCopyFile)}`;
            sails.log.verbose(`Copying ${apiCopyFile} to ${dest}`)
            fs.copySync(apiCopyFile, dest);
          }
        }
      }
      sails.log.verbose(`${hook_log_header}::Adding custom API elements...completed.`);
      sails.log.verbose(`${hookName}::Merge complete.`);
    }


    private walkDirSync(dir:string, filelist:any[] = []) {
      if (!fs.pathExistsSync(dir)) {
        return filelist;
      }
      try {
        var files = fs.readdirSync(dir).sort();
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

    private getDirsSync(srcPath: string) {
      if (!fs.pathExistsSync(srcPath)) {
        return [];
      }
      return fs.readdirSync(srcPath, { withFileTypes: true })
      .filter(dirent => dirent.isDirectory())
      .map(dirent => dirent.name);
    }

    private mergeTranslationFiles(hook_root_dir: string, hook_log_header: string, overwriteOrig:boolean = false) {
      const langCodes = this.getDirsSync(`${hook_root_dir}/locales`);
      sails.log.verbose(`${hook_log_header}::Language codes to process: ${JSON.stringify(langCodes)}`);
      for (let langCode of langCodes) {
        const langBasePath = `locales/${langCode}/translation`;
        const langJsonPath = `${langBasePath}.json`;
        const langCsvPath = `${langBasePath}.csv`;
        const language_file_path = resolve(`assets/${langJsonPath}`);
        const hook_language_file_path = resolve(hook_root_dir, langJsonPath);  
        const hook_language_file_csv_path = resolve(hook_root_dir, langCsvPath);
        const mergeFn = function () {
          // the actual merge
          if (fs.pathExistsSync(language_file_path) && fs.pathExistsSync(hook_language_file_path)) {
            sails.log.verbose(`${hook_log_header}::Merging '${langCode}' translation file...`);
            const mainTranslation = require(language_file_path);
            const hookTranslation = require(hook_language_file_path);
            _.merge(mainTranslation, hookTranslation);
            // if not overwriting the original, we save a copy of the 'core' version 
            if (!overwriteOrig) {
              const core_language_file_path = `assets/${langBasePath}-core.json`;
              if (!fs.pathExistsSync(core_language_file_path)) {
                fs.copySync(language_file_path, core_language_file_path);
              }
            }
            fs.writeFileSync(language_file_path, JSON.stringify(mainTranslation, null, 2));
          } 
        };
        // check if the CSV version is there, and if so convert it
        if (fs.pathExistsSync(hook_language_file_csv_path)) {
          // convert the CSV to JSON 
          this.csvToi18Next(hook_language_file_csv_path, hook_language_file_path, mergeFn);
        } else {
          mergeFn();
        }
      }
    }

    private csvToi18Next(csvPath: string, jsonPath: string, cb: any) {
      const csv = require('csv-parser');  

      let languageJson = {};
      fs.createReadStream(csvPath)  
        .pipe(csv())
        .on('data', (row) => {
          languageJson[row.Key] = row.Message;
        })
        .on('end', () => {
          let data = JSON.stringify(languageJson, null, "  ");
          data = data.replace(/\\\\\\/g, '\\');
          fs.writeFileSync(jsonPath, data);
          cb();
        });
    }    

  }
}
module.exports = new Services.Config().exports();
