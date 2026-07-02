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

import path from 'path';
import { Services as services } from '../CoreService';
import { resolveHookViewFile } from '../hooks/hookResources';
import type { ResolvedHookFile } from '../hooks/hookResources';


export namespace Services {
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

    private getCoreViewRoot(): string {
      return path.resolve(sails.config.appPath, 'views');
    }

    private resolveCoreViewFile(viewPath: string): ResolvedHookFile | null {
      return resolveHookViewFile(sails.config.appPath, viewPath, {
        roots: [this.getCoreViewRoot()],
        extension: '.ejs',
      });
    }

    private resolveViewCandidate(viewPath: string): ResolvedHookFile | null {
      return resolveHookViewFile(sails.config.appPath, viewPath)
        ?? this.resolveCoreViewFile(viewPath);
    }

    private resolveTemplateDirectory(templatePath: string): string {
      const resolvedTemplatePath = path.resolve(templatePath);
      return path.extname(path.basename(resolvedTemplatePath))
        ? path.dirname(resolvedTemplatePath)
        : resolvedTemplatePath;
    }

    /**
     * Extracts a display value from the request locals using a dot-notation path.
     * 
     * @param value - Dot-notation path to the value (e.g., 'user.name')
     * @param req - Express request object with options.locals
     * @param defaultValue - Value to return if path is not found
     * @returns The value at the specified path, or the default value
     */
    public displayValue(value: string, req: Sails.Req, defaultValue: string = ""): unknown {
      const keyArray = value.split('.');
      let returnValue: unknown = defaultValue;
      const locals = req.options?.locals as Record<string, unknown> | undefined;
      if (!locals) {
        return defaultValue;
      }
      for (let i = 0; i < keyArray.length; i++) {
        returnValue = locals[keyArray[i]];
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
      _fromTemplate: boolean = false
    ): string {
      const candidates = [
        `${branding}/${portal}/${value}`,
        `default/${portal}/${value}`,
        `default/default/${value}`,
      ];

      for (const candidate of candidates) {
        const resolvedPartial = this.resolveViewCandidate(candidate);
        if (resolvedPartial) {
          const templateDirectory = this.resolveTemplateDirectory(templatePath);
          const relativePartialPath = path.relative(templateDirectory, resolvedPartial.absolutePath);
          return relativePartialPath.replace(/\\/g, '/');
        }
      }

      return value;
    }
  }
}

declare global {
  let ViewUtilsService: Services.ViewUtils;
}
