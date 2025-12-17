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
import { DateTime } from 'luxon';
import { ConfigService } from './config.service';
import { LoggerService } from './logger.service';
import { get as _get, isEmpty as _isEmpty, isUndefined as _isUndefined, isNull as _isNull, isArray as _isArray } from 'lodash-es';
import { UtilityService } from './utility.service';
import { HttpClientService } from './httpClient.service';

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

    // Cache of loaded dashboard configurations to avoid re-fetching
    private loadedConfigs: Set<string> = new Set();
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
     * Register Handlebars helpers for use in dashboard templates.
     * Provides utility functions for date formatting, conditionals, etc.
     */
    private registerHelpers() {
        if (this.helpersRegistered) {
            return;
        }

        // Locale-aware date formatting helper
        Handlebars.registerHelper('formatDateLocale', (dateString: string, presetName?: string) => {
            if (!dateString) { return ''; }
            try {
                const dt = DateTime.fromISO(dateString);
                if (!dt.isValid) { return dateString; }

                const presetMap: any = {
                    DATE_SHORT: DateTime.DATE_SHORT,
                    DATE_MED: DateTime.DATE_MED,
                    DATE_FULL: DateTime.DATE_FULL,
                    DATETIME_MED: DateTime.DATETIME_MED,
                    DATETIME_SHORT: DateTime.DATETIME_SHORT,
                    DATETIME_FULL: DateTime.DATETIME_FULL
                };

                const preset = presetMap[presetName || 'DATETIME_MED'];
                return dt.setLocale(navigator.language).toLocaleString(preset);
            } catch {
                return dateString;
            }
        });

        // Parse date string helper (for chaining)
        Handlebars.registerHelper('parseDateString', (dateString: string) => {
            return dateString;
        });

        // Get nested property helper
        Handlebars.registerHelper('get', (obj: any, path: string) => {
            return _get(obj, path, '');
        });

        // Equality comparison helper
        Handlebars.registerHelper('eq', (a: any, b: any) => {
            return a === b;
        });

        // Not equal helper
        Handlebars.registerHelper('ne', (a: any, b: any) => {
            return a !== b;
        });

        // And helper
        Handlebars.registerHelper('and', (...args: any[]) => {
            args.pop(); // Remove options hash
            return args.every(Boolean);
        });

        // Or helper 
        Handlebars.registerHelper('or', (...args: any[]) => {
            args.pop(); // Remove options hash
            return args.some(Boolean);
        });

        // isEmpty helper
        Handlebars.registerHelper('isEmpty', (value: any) => {
            return _isEmpty(value);
        });

        // isUndefined helper
        Handlebars.registerHelper('isUndefined', (value: any) => {
            return _isUndefined(value);
        });

        // isNull helper
        Handlebars.registerHelper('isNull', (value: any) => {
            return _isNull(value);
        });

        // isDefined helper (not undefined and not null)
        Handlebars.registerHelper('isDefined', (value: any) => {
            return !_isUndefined(value) && !_isNull(value);
        });

        // Translation helper - will be resolved via context.translationService
        Handlebars.registerHelper('t', function (this: any, key: string) {
            const translationService = this.translationService;
            if (translationService && typeof translationService.t === 'function') {
                return translationService.t(key);
            }
            return key;
        });

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

        if (this.loadedConfigs.has(cacheKey)) {
            this.loggerService.debug(`Templates already loaded for ${cacheKey}`);
            return;
        }

        try {
            const brandingAndPortalUrl = `${this.baseUrl}${this.rootContext}/${branding}/${portal}`;
            // path array for getDynamicImport
            const urlPath = ['dynamicAsset', 'recordDashboardTemplates', recordType, `${workflowStage}?dashboardType=${dashboardType}`];

            this.loggerService.debug(`Loading dashboard templates module for ${cacheKey}`);

            // Load module
            const module = await this.utilService.getDynamicImport(brandingAndPortalUrl, urlPath);

            if (module && typeof module.evaluate === 'function') {
                // Register the module using keys derived from the configuration context
                this.registerModule(module, recordType, workflowStage, dashboardType);
                this.loggerService.debug(`HandlebarsTemplateService: Loaded and registered module for ${recordType}__${workflowStage}`);
                this.loadedConfigs.add(cacheKey);
                this.loggerService.debug(`Loaded templates for ${cacheKey}`);
            } else {
                this.loggerService.error(`Invalid module loaded for ${cacheKey}`);
            }

        } catch (error) {
            this.loggerService.error(`HandlebarsTemplateService: Failed to load dashboard templates for ${cacheKey}:`, error);
        }
    }

    private registerModule(module: any, recordType: string, workflowStage: string, dashboardType: string) {
        // Register under specific context keys
        this.moduleRegistry.set(`${recordType}__${workflowStage}`, module);
        this.moduleRegistry.set(`${recordType}__${dashboardType}`, module);
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
        if (keyParts && keyParts.length >= 2) {
            const result = this.runPrecompiled(keyParts, context);
            if (result !== null) {
                return result;
            }
        }

        // Return empty string if no pre-compiled template found - CSP restricts runtime compilation
        if (!keyParts || keyParts.length < 2) {
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
        if (!_isArray(keyParts) || keyParts.length < 2) {
            return null;
        }

        const recordType = keyParts[0];
        const secondary = keyParts[1]; // workflowStage or dashboardType

        const moduleKey = `${recordType}__${secondary}`;
        const module = this.moduleRegistry.get(moduleKey);

        if (!module) {
            this.loggerService.warn(`HandlebarsTemplateService: Module not found for key: ${moduleKey}. Available keys: ${Array.from(this.moduleRegistry.keys()).join(', ')}`);
            return null;
        }

        try {
            // The evaluate function compiles and runs the template with the context
            // dynamicScriptAsset returns the rendered result directly: Handlebars.template(spec)(context)
            const result = module.evaluate(keyParts, context, { libraries: { Handlebars } });
            return result;
        } catch (e) {
            this.loggerService.error(`HandlebarsTemplateService: Error executing pre-compiled template for key ${keyParts.join('__')}: ${e}`);
        }

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
        this.loadedConfigs.clear();
        this.moduleRegistry.clear();
        this.loggerService.debug('Template cache cleared');
    }

    /**
     * Get the number of cached templates.
     */
    public getCacheSize(): number {
        return this.moduleRegistry.size;
    }
}
