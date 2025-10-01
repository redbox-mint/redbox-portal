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

import {PopulateExportedMethods, Services as services} from '@researchdatabox/redbox-core-types';
import {Sails} from "sails";
import jsonata, {Expression} from "jsonata";
import Handlebars from "handlebars";
import {TemplateCompileItem} from "@researchdatabox/sails-ng-common";
import {TemplateCompileInput, templateCompileKind} from "../additional/TemplateCompile";

declare var sails: Sails;

export module Services {

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
            const keys = inputs.map(i => i.key);
            const keysUnique = new Set(keys);
            if (keysUnique.size != keys.length) {
                const duplicates = keys.filter((item, index) => keys.indexOf(item) != index);
                const duplicatesUnique = Array.from(new Set(duplicates)).sort();
                throw new Error(`Keys must be unique: '${duplicatesUnique.join(', ')}'`);
            }

            const result = [];
            for (const input of inputs) {
                switch (input.kind) {
                    case "jsonata":
                        result.push({
                            key: input.key?.toString(),
                            value: `${this.buildClientJsonata(input.value)?.toString()}.evaluate(context)`,
                        })
                        break;
                    case "handlebars":
                        result.push({
                            key: input.key?.toString(),
                            value: `Handlebars.template(${this.buildClientHandlebars(input.value)?.toString()})(context)`,
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
        public buildClientJsonata(expression: string): string {
            expression = this.normalise(expression);
            sails.log.verbose(`Compiling client JSONata expression '${expression}'`);
            const compiled = this.buildSharedJsonata(expression);

            const result = JSON.stringify(compiled, function (key, value) {
                if (typeof value === 'function') {
                    return value.toString()
                }
                return value
            }, 0);
            return result?.toString();
        }

        /**
         * Compile a JSONata expression to a form that is ready to be executed on the server.
         *
         * The expression will be normalised and have some transformations applied.
         *
         * @param expression The JSONata expression to compile.
         */
        public buildServerJsonata(expression: string): Expression {
            expression = this.normalise(expression);
            sails.log.verbose(`Build server JSONata expression '${expression}'`);
            return this.buildSharedJsonata(expression);
        }

        /**
         * Compile a Handlebars template to a form that is ready to be executed on the client.
         *
         * The template will be normalised and have some transformations applied.
         *
         * @param template
         */
        public buildClientHandlebars(template: string): string {
            template = this.buildSharedHandlebars(template);
            sails.log.verbose(`Building client Handlebars template '${template}'`);
            // handlebars pre-compiled output is already a string
            return Handlebars.precompile(template)?.toString();
        }

        /**
         * Compile a Handlebars template to a form that is ready to be executed on the server.
         *
         * The template will be normalised and have some transformations applied.
         *
         * @param template
         */
        public buildServerHandlebars(template: string): HandlebarsTemplateDelegate {
            template = this.buildSharedHandlebars(template);
            sails.log.verbose(`Building server Handlebars template '${template}'`);
            return Handlebars.compile(template);
        }

        private buildSharedJsonata(expression: string): Expression {
            const compiled = jsonata(expression);

            // override the built-in JSONata 'eval' function
            // TODO: check this actually overrides the 'eval' function
            compiled.registerFunction("eval", () => undefined);

            // TODO: register a function for obtaining translations
            // TODO: register a function for formatting date time values
            // TODO: register a function / context state holder that provides model data
            // TODO: replace regex with google's re2?

            return compiled;
        }

        private buildSharedHandlebars(template: string) {
            return this.normalise(template);
        }

        /**
         * Normalise a string to reduce the potential variations in how characters are specified.
         *
         * @param value The string to normalise.
         */
        private normalise(value: string): string {
            value = value?.toString() ?? "";

            // Use NFKC: Compatibility Decomposition, followed by Canonical Composition.
            // For Identifiers matching: Canonical form, no visual variants
            const normForm = "NFKC";
            const norm = value.normalize(normForm);

            // TODO: other normalisations?

            return norm;
        }
    }
}
module.exports = new Services.Template().exports();
