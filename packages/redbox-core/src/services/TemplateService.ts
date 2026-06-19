// Copyright (c) 2025 Queensland Cyber Infrastructure Foundation (http://www.qcif.edu.au/)
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

import {PopulateExportedMethods} from '../decorator/PopulateExportedMethods.decorator';
import {Services as services} from '../CoreService';
import {
  buildKeyString,
  handlebarsCompile,
  handlebarsPrecompile,
  jsonataCompile,
  jsonataExpressionEncode,
  normaliseVisual,
  TemplateCompileInput,
  TemplateCompileItem,
  TemplateCompileKey,
  templateCompileKind,
} from '@researchdatabox/sails-ng-common';

export namespace Services {
  @PopulateExportedMethods
  export class Template extends services.Core.Service {
    /**
     * Compile one or more inputs into an output mapping.
     *
     * The mapping provides a function 'evaluate(key, context)'.
     * Provide the key for the template, and the context to apply to the template.
     * @param inputs
     */
    public buildClientMapping(inputs: TemplateCompileInput[]): TemplateCompileItem[] {
      const keys = inputs.map(i => buildKeyString(i.key));
      const keysUnique = new Set(keys);
      if (keysUnique.size != keys.length) {
        const duplicates = keys.filter((item, index) => keys.indexOf(item) != index);
        const duplicatesUnique = Array.from(new Set(duplicates)).sort();
        throw new Error(`Keys must be unique: '${duplicatesUnique.join(', ')}'`);
      }

      const result: TemplateCompileItem[] = [];
      for (const input of inputs) {
        // The key is stored as a string array (composite key).
        // The duplicate check above uses the flattened, normalized string form (buildKeyString)
        // to ensure uniqueness across the composite keys.
        switch (input.kind) {
          case 'jsonata':
            const jsonataExpr = this.buildClientJsonata(input.value);
            if (jsonataExpr) {
              const jsonataExprEncoded = jsonataExpressionEncode(jsonataExpr);
              result.push({
                key: input.key,
                value: `jsonata("${jsonataExprEncoded}").evaluate(context);`,
              });
            }
            break;
          case 'handlebars':
            result.push({
              key: input.key,
              value: `handlebars(${this.buildClientHandlebars(input.value)?.toString()})(context)`,
            });
            break;
          default:
            throw new Error(`Unknown input kind '${input.kind}' expected one of: '${templateCompileKind.join(', ')}'`);
        }
      }
      return result;
    }

    /**
     * Compile a JSONata expression to a form that is ready to be executed on the client.
     *
     * The expression will be normalised and have some transformations applied.
     *
     * @param expression The JSONata expression to compile.
     */
    public buildClientJsonata(expression: string): string | null {
      try {
        // Validate the expression by compiling it
        const compiled = jsonataCompile(expression);
        sails.log.verbose(`Validated client JSONata expression '${expression}'`, compiled);
        // Return the expression string for client-side compilation
        // The client will call jsonata(expression).evaluate(context)
        return expression;
      } catch (error) {
        sails.log.error(`Could not compile client JSONata expression '${expression}'`, error);
        return null;
      }
    }

    /**
     * Compile a Handlebars template to a form that is ready to be executed on the client.
     *
     * The template will be normalised and have some transformations applied.
     *
     * @param template
     */
    public buildClientHandlebars(template: string): string | null {
      try {
        return handlebarsPrecompile(template)?.toString();
      } catch (error) {
        sails.log.error(`Could not build client Handlebars template '${template}'`, error);
        return null;
      }
    }

    public buildKeyString(key: TemplateCompileKey): string {
      return buildKeyString(key);
    }
  }
}

declare global {
  let TemplateService: Services.Template;
}
