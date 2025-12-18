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

import { Inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { APP_BASE_HREF } from '@angular/common';
import { firstValueFrom } from 'rxjs';
import Handlebars from 'handlebars/runtime';
import { ConfigService } from './config.service';
import { LoggerService } from './logger.service';
import { isArray as _isArray } from 'lodash-es';
import { UtilityService } from './utility.service';
import { HttpClientService } from './httpClient.service';
import { registerSharedHandlebarsHelpers } from '@researchdatabox/sails-ng-common';

// Type for compiled Handlebars template function
type TemplateFunction = (context: any) => string;

/**
 * Service for managing pre-compiled Handlebars templates from the server.
 * Fetches compiled templates from the dashboard endpoint and executes them client-side.
 * 
 * This service replaces the lodash template approach to support Content Security Policy
 * by using pre-compiled Handlebars templates.
 */
@Injectable({
    providedIn: 'root'
})
export class HandlebarsTemplateService extends HttpClientService {

    // Registry of loaded template modules
    private moduleRegistry: Map<string, any> = new Map();
    private helpersRegistered = false;

    constructor(
        @Inject(HttpClient) http: HttpClient,
        @Inject(APP_BASE_HREF) rootContext: string,
        @Inject(UtilityService) utilityService: UtilityService,
        @Inject(ConfigService) configService: ConfigService,
        @Inject(LoggerService) private loggerService: LoggerService
    ) {
        super(http, rootContext, utilityService, configService);
        this.registerHelpers();
    }

    public override async waitForInit(): Promise<any> {
        await super.waitForInit();
        this.enableCsrfHeader();
        return this;
    }

    /**
     * Register Handlebars helpers for use in dashboard and report templates.
     * Uses shared helpers from sails-ng-common for consistency between server and client.
     */
    private registerHelpers() {
        if (this.helpersRegistered) {
            return;
        }

        // Register all shared helpers from sails-ng-common
        registerSharedHandlebarsHelpers(Handlebars);

        this.helpersRegistered = true;
        this.loggerService.debug('Handlebars helpers registered');
    }

    /**
     * Load pre-compiled templates from the server for a specific record type and workflow stage.
     * Templates are loaded as ES modules using dynamic import.
     * 
     * @param branding The branding name
     * @param portal The portal name  
     * @param recordType The record type name
     * @param workflowStage The workflow stage name
     * @param dashboardType Optional dashboard type to load specific configuration
     */
    public async loadDashboardTemplates(branding: string, portal: string, recordType: string, workflowStage: string, dashboardType: string = 'standard'): Promise<void> {
        const cacheKey = `${branding}/${portal}/${recordType}/${workflowStage}/${dashboardType}`;

        try {
            const brandingAndPortalUrl = `${this.baseUrl}${this.rootContext}/${branding}/${portal}`;
            // path array for getDynamicImport
            const urlPath = ['dynamicAsset', 'recordDashboardTemplates', recordType, `${workflowStage}?dashboardType=${dashboardType}`];

            this.loggerService.debug(`Loading dashboard templates module for ${cacheKey}`);

            // Load module
            const module = await this.utilService.getDynamicImport(brandingAndPortalUrl, urlPath);

            if (module && typeof module.evaluate === 'function') {
                // Register the module using keys derived from the configuration context
                this.registerDashboardModule(module, recordType, workflowStage, dashboardType);
                this.loggerService.debug(`HandlebarsTemplateService: Loaded and registered module for ${recordType}__${workflowStage}`);
                this.loggerService.debug(`Loaded templates for ${cacheKey}`);
            } else {
                this.loggerService.error(`Invalid module loaded for ${cacheKey}`);
            }

        } catch (error) {
            this.loggerService.error(`HandlebarsTemplateService: Failed to load dashboard templates for ${cacheKey}:`, error);
        }
    }

    /**
     * Load pre-compiled templates from the server for a specific report.
     * Templates are loaded as ES modules using dynamic import.
     * 
     * @param branding The branding name
     * @param portal The portal name
     * @param reportName The name of the report
     */
    public async loadReportTemplates(branding: string, portal: string, reportName: string): Promise<void> {
        const cacheKey = `${branding}/${portal}/report/${reportName}`;

        try {
            const brandingAndPortalUrl = `${this.baseUrl}${this.rootContext}/${branding}/${portal}`;
            // path array for getDynamicImport
            const urlPath = ['dynamicAsset', 'adminReportTemplates', reportName];

            this.loggerService.debug(`Loading report templates module for ${cacheKey}`);

            // Load module
            const module = await this.utilService.getDynamicImport(brandingAndPortalUrl, urlPath);

            if (module && typeof module.evaluate === 'function') {
                // Register the module using the report name as key
                this.registerReportModule(module, reportName);
                this.loggerService.debug(`HandlebarsTemplateService: Loaded and registered report module for ${reportName}`);
                this.loggerService.debug(`Loaded report templates for ${cacheKey}`);
            } else {
                this.loggerService.error(`Invalid report module loaded for ${cacheKey}`);
            }

        } catch (error) {
            this.loggerService.error(`HandlebarsTemplateService: Failed to load report templates for ${cacheKey}:`, error);
        }
    }

    private registerDashboardModule(module: any, recordType: string, workflowStage: string, dashboardType: string) {
        // Register under specific context keys
        this.moduleRegistry.set(`${recordType}__${workflowStage}`, module);
        this.moduleRegistry.set(`${recordType}__${dashboardType}`, module);
    }

    private registerReportModule(module: any, reportName: string) {
        // Register under report name key
        this.moduleRegistry.set(reportName, module);
    }

    /**
     * Compile and run a template.
     * Tries to use pre-compiled template first if keyParts are provided.
     * Fallbacks to runtime compilation (if CSP allows) for inline strings.
     * 
     * @param templateString The template string (used as fallback or for valid inline templates)
     * @param context The context for the template
     * @param keyParts Optional key parts to look up pre-compiled template
     */
    public compileAndRunTemplate(templateString: string, context: any, keyParts?: string[]): string {
        // Try pre-compiled first
        if (keyParts && keyParts.length > 0) {
            const result = this.runPrecompiled(keyParts, context);
            if (result !== null) {
                return result;
            }
        }

        // Return empty string if no pre-compiled template found - CSP restricts runtime compilation
        if (!keyParts || keyParts.length === 0) {
            this.loggerService.warn(`No key parts provided for template execution. Runtime compilation is disabled by CSP. Template: ${templateString.substring(0, 50)}...`);
            return '';
        }

        this.loggerService.warn(`Pre-compiled template not found for key: ${keyParts.join('__')}. Runtime compilation is disabled by CSP.`);
        return '';
    }

    /**
     * Execute a pre-compiled template if available.
     * 
     * @param keyParts The template key parts array
     * @param context The template context/data
     * @returns The rendered template string or null if not found
     */
    private runPrecompiled(keyParts: string[], context: any): string | null {
        // keyParts is array
        if (!_isArray(keyParts) || keyParts.length === 0) {
            return null;
        }

        // Standardised lookup: try to find a module matching the key parts, 
        // starting from the most specific (longest key) down to the least specific.
        // This supports keys of any length (e.g. recordType__workflowStage or just reportName).
        for (let i = keyParts.length; i > 0; i--) {
            const key = this.buildKeyString(keyParts.slice(0, i));
            const module = this.moduleRegistry.get(key);
            
            if (module) {
                try {
                    // The evaluate function compiles and runs the template with the context
                    // dynamicScriptAsset returns the rendered result directly: Handlebars.template(spec)(context)
                    return module.evaluate(keyParts, context, { libraries: { Handlebars } });
                } catch (e) {
                    this.loggerService.error(`HandlebarsTemplateService: Error executing pre-compiled template for key ${keyParts.join('__')}: ${e}`);
                    return null;
                }
            }
        }

        this.loggerService.warn(`HandlebarsTemplateService: Module not found for keys: ${keyParts.join('__')}. Available keys: ${Array.from(this.moduleRegistry.keys()).join(', ')}`);
        return null;
    }

    /**
     * Check if a template is loaded in the cache.
     * 
     * @param key The template string or key
     * @returns true if the template exists in cache
     */
    public hasTemplate(key: string): boolean {
        return this.moduleRegistry.has(key);
    }

    /**
     * Build a template key string from key parts (same format as server).
     * 
     * @param keyParts Array of key parts
     * @returns The formatted key string
     */
    public buildKeyString(keyParts: string[]): string {
        return keyParts.map(i => i?.toString()?.normalize('NFKC')).join('__');
    }

    /**
     * Clear all cached templates.
     */
    public clearCache(): void {
        this.utilService.clearDynamicImportCache();
        this.moduleRegistry.clear();
        this.loggerService.debug('Template cache cleared');
    }

    /**
     * Get the number of cached templates.
     */
    public getCacheSize(): number {
        return this.moduleRegistry.size;
    }

    /**
     * Get the libraries used by the templates (e.g. Handlebars with registered helpers).
     */
    public getLibraries(): any {
        return { Handlebars };
    }
}
