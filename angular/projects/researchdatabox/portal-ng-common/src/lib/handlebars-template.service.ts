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
import { ConfigService } from './config.service';
import { LoggerService } from './logger.service';
import { isArray as _isArray } from 'lodash-es';
import { UtilityService } from './utility.service';
import { HttpClientService } from './httpClient.service';
import {buildKeyString, handlebarsInstance, handlebarsTemplate} from '@researchdatabox/sails-ng-common';

export type DashboardTemplateTarget =
    | { kind: 'workflow'; recordType: string; stage: string }
    | { kind: 'view'; view: string; step: string };

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

    constructor(
        @Inject(HttpClient) http: HttpClient,
        @Inject(APP_BASE_HREF) rootContext: string,
        @Inject(UtilityService) utilityService: UtilityService,
        @Inject(ConfigService) configService: ConfigService,
        @Inject(LoggerService) private loggerService: LoggerService
    ) {
        super(http, rootContext, utilityService, configService);
    }

    public override async waitForInit(): Promise<any> {
        await super.waitForInit();
        this.enableCsrfHeader();
        return this;
    }

    /**
     * Template key prefix for one dashboard target at an exact settings
     * version. Must match DashboardTypesService.buildDashboardTemplateKeyPrefix.
     */
    public buildDashboardTemplateKeyPrefix(branding: string, target: DashboardTemplateTarget, settingsFingerprint: string): string[] {
        return target.kind === 'workflow'
            ? [branding, 'workflow', target.recordType, target.stage, settingsFingerprint.slice(0, 16)]
            : [branding, 'view', target.view, target.step, settingsFingerprint.slice(0, 16)];
    }

    /**
     * Load the compiled templates for one workflow stage or dashboard-view step,
     * pinned to the settings fingerprint the page loaded. Returns false when the
     * server reports that the settings changed (or the module failed to load), so
     * the caller can reload settings and templates together.
     */
    public async loadDashboardTargetTemplates(branding: string, portal: string, target: DashboardTemplateTarget, settingsFingerprint: string): Promise<boolean> {
        const registryKey = buildKeyString(this.buildDashboardTemplateKeyPrefix(branding, target, settingsFingerprint));
        if (this.moduleRegistry.has(registryKey)) {
            return true;
        }
        const brandingAndPortalUrl = `${this.baseUrl}${this.rootContext}/${branding}/${portal}`;
        const urlPath = target.kind === 'workflow'
            ? ['dynamicAsset', 'recordDashboardTemplates', encodeURIComponent(target.recordType), encodeURIComponent(target.stage)]
            : ['dynamicAsset', 'dashboardViewTemplates', encodeURIComponent(target.view), encodeURIComponent(target.step)];
        try {
            const module = await this.utilService.getDynamicImport(brandingAndPortalUrl, urlPath, { settingsFingerprint });
            if (module && typeof module.evaluate === 'function') {
                this.moduleRegistry.set(registryKey, module);
                this.loggerService.debug(`HandlebarsTemplateService: Loaded dashboard templates ${registryKey}`);
                return true;
            }
            this.loggerService.error(`Invalid dashboard template module for ${registryKey}`);
        } catch (error) {
            this.loggerService.warn(`HandlebarsTemplateService: Could not load dashboard templates for ${registryKey}:`, error);
        }
        return false;
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
        const reportHintPath = `${branding}/${portal}/report/${reportName}`;

        try {
            const brandingAndPortalUrl = `${this.baseUrl}${this.rootContext}/${branding}/${portal}`;
            // path array for getDynamicImport
            const urlPath = ['dynamicAsset', 'adminReportTemplates', reportName];

            this.loggerService.debug(`Loading report templates module for ${reportHintPath}`);

            // Load module
            const module = await this.utilService.getDynamicImport(brandingAndPortalUrl, urlPath);

            if (module && typeof module.evaluate === 'function') {
                // Register the module using the report name as key
                this.registerReportModule(module, reportName);
                this.loggerService.debug(`HandlebarsTemplateService: Loaded and registered report module for ${reportName}`);
                this.loggerService.debug(`Loaded report templates for ${reportHintPath}`);
            } else {
                this.loggerService.error(`Invalid report module loaded for ${reportHintPath}`);
            }

        } catch (error) {
            this.loggerService.error(`HandlebarsTemplateService: Failed to load report templates for ${reportHintPath}:`, error);
        }
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
            const key = buildKeyString(keyParts.slice(0, i));
            const module = this.moduleRegistry.get(key);

            if (module) {
                try {
                    // The evaluate function compiles and runs the template with the context
                    // dynamicScriptAsset returns the rendered result directly: Handlebars.template(spec)(context)
                    return module.evaluate(keyParts, context, { libraries: {handlebars: handlebarsTemplate} });
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
     * Delegates to the shared function from sails-ng-common.
     *
     * @param keyParts Array of key parts
     * @returns The formatted key string
     */
    public buildKeyString(keyParts: string[]): string {
        return buildKeyString(keyParts);
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
}
