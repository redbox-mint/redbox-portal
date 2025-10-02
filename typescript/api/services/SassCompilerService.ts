import { PopulateExportedMethods } from '@researchdatabox/redbox-core-types';
import {Services as services}   from '@researchdatabox/redbox-core-types';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import sass from 'sass';
import os from 'os';
import fse from 'fs-extra';
// Use require to avoid type dependencies for webpack internals
const webpack = require('webpack');
const MiniCssExtractPlugin = require('mini-css-extract-plugin');
const CssMinimizerPlugin = require('css-minimizer-webpack-plugin');

declare var sails; // Sails global
declare var _;

/**
 * SassCompilerService
 * : compile semantic variable map into CSS using root assets/styles/style.scss
 * injecting tenant overrides after the variable import section.
 *
 * Usage: await SassCompilerService.compile({ 'site-branding-area-background': '#ffffff' })
 * Returns: { css, hash }
 */
export module Services {

    @PopulateExportedMethods
    export class SassCompiler extends services.Core.Service {
        getWhitelist(): string[] {
            return _.get(sails, 'config.branding.variableAllowList', []) || [];
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

        /** Compile full theme returning css + sha256 hash using webpack loader chain */
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

            // Build a temporary workspace for webpack to compile our injected SCSS using the project loader chain
            const tmpBase = path.join(process.cwd(), '.tmp', 'branding-webpack', crypto.randomBytes(8).toString('hex'));
            const tmpOut = path.join(tmpBase, 'dist');
            fse.mkdirpSync(tmpBase);
            // Write a temporary root.scss and entry.js that imports it
            const rootScssPath = path.join(tmpBase, 'root.scss');
            const entryJsPath = path.join(tmpBase, 'entry.js');
            fs.writeFileSync(rootScssPath, scss, 'utf8');
            fs.writeFileSync(entryJsPath, `require('./root.scss');\n`, 'utf8');

            // Minimal webpack config aligned with project's sass/css pipeline
            const wpConfig = {
                mode: 'production',
                devtool: false,
                entry: entryJsPath,
                output: {
                    path: tmpOut,
                    filename: 'bundle.js',
                    publicPath: '/',
                    clean: true
                },
                module: {
                    rules: [
                        {
                            test: /\.(sa|sc|c)ss$/,
                            exclude: /\.\.\/angular/,
                            use: [
                                MiniCssExtractPlugin.loader,
                                'css-loader',
                                'resolve-url-loader',
                                {
                                    loader: 'sass-loader',
                                    options: {
                                        sourceMap: true, // Required for resolve-url-loader
                                        sassOptions: {
                                            loadPaths: [
                                                path.resolve(process.cwd(), 'assets/styles'),
                                                path.resolve(process.cwd(), 'node_modules')
                                            ]
                                        }
                                    }
                                }
                            ]
                        },
                        {
                            test: /\.(woff2?|ttf|otf|eot|svg)$/,
                            type: 'asset/resource',
                            exclude: /\.\.\/angular/
                        },
                        {
                            mimetype: 'image/svg+xml',
                            scheme: 'data',
                            type: 'asset/resource',
                            generator: { filename: 'icons/[hash].svg' }
                        }
                    ]
                },
                plugins: [
                    new MiniCssExtractPlugin({ filename: 'style.css' })
                ],
                optimization: {
                    minimize: false,
                    minimizer: [ new CssMinimizerPlugin() ]
                },
                resolve: {
                    extensions: ['.js', '.ts', '.scss', '.css'],
                    modules: [path.resolve(process.cwd(), 'node_modules'), 'node_modules']
                },
                resolveLoader: {
                    modules: [path.resolve(process.cwd(), 'node_modules'), 'node_modules']
                },
                stats: 'errors-warnings'
            };

            const compiler = webpack(wpConfig);
            const stats = await new Promise<any>((resolve, reject) => {
                compiler.run((err: any, stats: any) => {
                    if (err) return reject(err);
                    const info = stats.toJson({ all: false, errors: true, warnings: true });
                    if (stats.hasErrors()) {
                        return reject(new Error('Webpack SCSS compile failed: ' + (info.errors && info.errors[0] && info.errors[0].message || 'unknown error')));
                    }
                    resolve(stats);
                });
            });

            // Read the emitted CSS
            const cssPath = path.join(tmpOut, 'style.css');
            const css = fs.readFileSync(cssPath, 'utf8');
            // Clean up temp directory (best-effort)
            try { fse.removeSync(tmpBase); } catch(_e) {}

            const hash = crypto.createHash('sha256').update(css).digest('hex').substring(0, 32);
            return { css, hash };
        }
    }
}
module.exports = new Services.SassCompiler().exports();
