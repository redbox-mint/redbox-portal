import { PopulateExportedMethods } from '@researchdatabox/redbox-core-types';
import {Services as services}   from '@researchdatabox/redbox-core-types';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import sass from 'sass';

declare var sails; // Sails global
declare var _;

/**
 * SassCompilerService
 * Task 2: compile semantic variable map into CSS using root assets/styles/style.scss
 * injecting tenant overrides after the variable import section.
 *
 * Usage: await SassCompilerService.compile({ 'site-branding-area-background': '#ffffff' })
 * Returns: { css, hash }
 */
export module Services {

    @PopulateExportedMethods
    export class SassCompiler extends services.Core.Service {
        getWhitelist(): string[] {
            return _.get(sails, 'config.branding.variableWhitelist', []) || [];
        }

        normaliseHex(value: string): string {
            if (!_.isString(value)) return value;
            let v = value.trim();
            if (v.startsWith('#')) {
                v = v.replace(/#/g, '');
                if (v.length === 3) v = v.split('').map(c => c + c).join('');
                if (v.length === 6 || v.length === 8) return '#' + v.toLowerCase();
            }
            return value;
        }

        /** Build SCSS root by injecting overrides after last *variables import */
        buildRootScss(overrideLines: string[]): string {
            const stylesDir = path.resolve(process.cwd(), 'assets/styles');
            const stylePath = path.join(stylesDir, 'style.scss');
            let content = fs.readFileSync(stylePath, 'utf8');

            // Resolve ~ imports to node_modules paths for Sass
            content = content.replace(/@import\s+"~([^"]+)"/g, (match, importPath) => {
                return `@import "${importPath}"`;
            });

            const lines = content.split(/\r?\n/);
            let insertIdx = -1;
            for (let i = 0; i < lines.length; i++) {
                if (/default-variables|custom-variables/.test(lines[i])) insertIdx = i;
            }
            if (insertIdx === -1) {
                for (let i = 0; i < lines.length; i++) {
                    if (!/^@import/.test(lines[i])) { insertIdx = i - 1; break; }
                }
                if (insertIdx < 0) insertIdx = 0;
            }
            lines.splice(insertIdx + 1, 0, ...overrideLines);
            return lines.join('\n');
        }

        /** Compile full theme returning css + sha256 hash */
        async compile(variables: Record<string, string>): Promise<{ css: string; hash: string; }> {
            const whitelist = this.getWhitelist();
            const invalid = Object.keys(variables || {}).filter(k => !whitelist.includes(k.replace(/^\$/, '')));
            if (invalid.length) throw new Error('Invalid variable(s): ' + invalid.join(', '));
            const overrideLines: string[] = [];
            for (const [key, rawVal] of Object.entries(variables || {})) {
                const normKey = key.startsWith('$') ? key.substring(1) : key;
                const value = this.normaliseHex(rawVal as string);
                overrideLines.push(`$${normKey}: ${value}; // tenant override`);
            }
            const scss = this.buildRootScss(overrideLines);
            
            // Custom importer to handle ~ prefix resolution
            const importer = {
                findFileUrl(url: string) {
                    if (url.startsWith('~')) {
                        // Resolve ~ imports to node_modules
                        const resolvedPath = url.substring(1); // Remove ~
                        const fullPath = path.resolve(process.cwd(), 'node_modules', resolvedPath);
                        return new URL(`file://${fullPath}`);
                    }
                    return null; // Let Sass handle normal imports
                }
            };
            
            const result = sass.compileString(scss, {
                style: 'expanded',
                loadPaths: [
                    path.resolve(process.cwd(), 'assets/styles'),
                    path.resolve(process.cwd(), 'node_modules')
                ],
                importers: [importer]
            });
            const css = result.css;
            const hash = crypto.createHash('sha256').update(css).digest('hex').substring(0, 32);
            return { css, hash };
        }
    }
}
module.exports = new Services.SassCompiler().exports();
