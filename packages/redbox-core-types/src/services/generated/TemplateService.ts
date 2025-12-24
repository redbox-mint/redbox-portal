// This file is generated from internal/sails-ts/api/services/TemplateService.ts. Do not edit directly.
import { PopulateExportedMethods, Services as services } from '../../index';
import { Sails } from "sails";
import jsonata, { Expression } from "jsonata";
import Handlebars from "handlebars";
import { TemplateCompileItem, TemplateCompileInput, templateCompileKind, registerSharedHandlebarsHelpers, buildKeyString } from "@researchdatabox/sails-ng-common";

export interface TemplateService {
  buildClientMapping(inputs: TemplateCompileInput[]): TemplateCompileItem[];
  buildClientJsonata(expression: string): string | null;
  buildServerJsonata(expression: string): Expression | null;
  buildClientHandlebars(template: string): string | null;
  buildServerHandlebars(template: string): HandlebarsTemplateDelegate | null;
  buildKeyString(key: string[]): string;
}
