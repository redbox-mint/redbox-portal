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

import { existsSync } from 'fs';
import { Services as services } from '../CoreService';

declare var sails: any;

export module Services {
  /**
   * View utility functions for template resolution and display value extraction.
   *
   * Author: <a href='https://github.com/shilob' target='_blank'>Shilo Banihit</a>
   */
  export class ViewUtils extends services.Core.Service {

    protected override _exportedMethods: string[] = [
      'displayValue',
      'resolvePartialPath'
    ];

    /**
     * Extracts a display value from the request locals using a dot-notation path.
     * 
     * @param value - Dot-notation path to the value (e.g., 'user.name')
     * @param req - Express request object with options.locals
     * @param defaultValue - Value to return if path is not found
     * @returns The value at the specified path, or the default value
     */
    public displayValue(value: string, req: any, defaultValue: string = ""): any {
      const keyArray = value.split('.');
      let returnValue: any = defaultValue;
      for (let i = 0; i < keyArray.length; i++) {
        returnValue = req.options.locals[keyArray[i]];
        if (returnValue == null) {
          return defaultValue;
        }
      }
      return returnValue;
    }

    /**
     * Resolves the path to a partial template, checking multiple branding/portal locations.
     * Falls back through branding-specific, then portal-specific, then default locations.
     * 
     * @param value - The partial template name
     * @param branding - The branding name
     * @param portal - The portal name
     * @param templatePath - The current template path
     * @param fromTemplate - Whether this is being called from within a template
     * @returns The resolved partial path with appropriate relative prefixes
     */
    public resolvePartialPath(
      value: string,
      branding: string,
      portal: string,
      templatePath: string,
      fromTemplate: boolean = false
    ): string {
      let partialLocation = value;
      const viewsDir = sails.config.appPath + "/views";
      const masterTemplateLocation = templatePath.substring(viewsDir.length, templatePath.length);
      const splitUrl = masterTemplateLocation.split('/');

      if (splitUrl.length > 2) {
        // Try branding + portal specific path
        let locationToTest = sails.config.appPath + "/views/" + branding + "/" + portal + "/" + value;
        sails.log.debug("testing :" + locationToTest);
        if (existsSync(locationToTest)) {
          partialLocation = branding + "/" + portal + "/" + value;
        }

        // Try default branding + specific portal path
        if (partialLocation === value) {
          locationToTest = sails.config.appPath + "/views/default/" + portal + "/" + value;
          sails.log.debug("testing :" + locationToTest);
          if (existsSync(locationToTest)) {
            partialLocation = "default/" + portal + "/" + value;
          }
        }

        // Try default branding + default portal path
        if (partialLocation === value) {
          locationToTest = sails.config.appPath + "/views/default/default/" + value;
          sails.log.debug("testing :" + locationToTest);
          if (existsSync(locationToTest)) {
            partialLocation = "default/default/" + value;
          }
        }

        // Add relative path prefixes if a location was found
        if (partialLocation !== value) {
          if (!fromTemplate) {
            const numberOfLevels = splitUrl.length - 2;
            for (let i = 0; i < numberOfLevels; i++) {
              partialLocation = "../" + partialLocation;
            }
          } else {
            const numberOfLevels = 2;
            for (let i = 0; i < numberOfLevels; i++) {
              partialLocation = "../" + partialLocation;
            }
          }
        }

        return partialLocation;
      }

      return partialLocation;
    }
  }
}

declare global {
  let ViewUtilsService: Services.ViewUtils;
}
