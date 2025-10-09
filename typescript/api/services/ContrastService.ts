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

import { Services as services } from '@researchdatabox/redbox-core-types';
import { PopulateExportedMethods } from '@researchdatabox/redbox-core-types';

declare var sails: any;
declare var _: any;

const textSizes = ['normal', 'large'] as const;
type TextSize = typeof textSizes[number];

/**
 * Represents a contrast ratio violation for a color pair
 */
export interface ContrastViolation {
    /** Name identifier for the color pair */
    pair: string;
    /** Actual contrast ratio calculated */
    ratio: number;
    /** Minimum required ratio per WCAG AA */
    required: number;
    /** The two colors being compared [foreground, background] */
    colors: [string, string];
    /** Text size category affecting minimum ratio */
    textSize: TextSize;
}

/**
 * ContrastService
 * 
 * Validate color contrast ratios using WCAG AA standards
 * and provide suggestions for compliant color combinations.
 *
 * Usage: await ContrastService.validate(variablesMap)
 * Returns: { valid: boolean, violations: ContrastViolation[] }
 *
 * Usage: await ContrastService.suggestCompliant(colorA, colorB)
 * Returns: { suggested: string, originalRatio: number, newRatio: number }
 */
export module Services {
    export class Contrast extends services.Core.Service {

        protected _exportedMethods: any = [
            'validate',
            'suggestCompliant',
            'calculateRatio',
            'getLuminance'
        ];

        /**
         * WCAG AA contrast requirements
         * Normal text: 4.5:1, Large text: 3:1
         */
        private readonly WCAG_AA_NORMAL = 4.5;
        private readonly WCAG_AA_LARGE = 3.0;

        /**
         * Convert hex color to RGB values
         */
        private hexToRgb(hex: string): { r: number; g: number; b: number } | null {
            const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
            return result ? {
                r: parseInt(result[1], 16),
                g: parseInt(result[2], 16),
                b: parseInt(result[3], 16)
            } : null;
        }

        /**
         * Calculate relative luminance of a color
         * Formula: https://www.w3.org/TR/WCAG21/#dfn-relative-luminance
         */
        getLuminance(color: string): number {
            const rgb = this.hexToRgb(color);
            if (!rgb) return 0;

            const { r, g, b } = rgb;

            // Convert to linear RGB values
            const toLinear = (c: number) => {
                c = c / 255;
                return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
            };

            const rLinear = toLinear(r);
            const gLinear = toLinear(g);
            const bLinear = toLinear(b);

            // Calculate luminance
            return 0.2126 * rLinear + 0.7152 * gLinear + 0.0722 * bLinear;
        }

        /**
         * Calculate contrast ratio between two colors
         * Formula: https://www.w3.org/TR/WCAG21/#dfn-contrast-ratio
         */
        calculateRatio(colorA: string, colorB: string): number {
            const lumA = this.getLuminance(colorA);
            const lumB = this.getLuminance(colorB);

            const lighter = Math.max(lumA, lumB);
            const darker = Math.min(lumA, lumB);

            return (lighter + 0.05) / (darker + 0.05);
        }

        /**
         * Validate contrast ratios for defined color pairs
         * Returns violations for pairs that don't meet WCAG AA standards
         */
        validate(variables: Record<string, string>): {
            valid: boolean;
            violations: ContrastViolation[];
        } {
            const violations: ContrastViolation[] = [];

            // Define color pairs to validate based on branding requirements
            const pairs = [
                // Primary text on primary background
                {
                    name: 'primary-text-on-primary-bg',
                    fg: variables['primary-text-color'] || '#ffffff',
                    bg: variables['primary-color'] || '#007bff',
                    textSize: 'normal' as const
                },
                // Secondary text on secondary background
                {
                    name: 'secondary-text-on-secondary-bg',
{
    name: 'secondary-text-on-secondary-bg',
    fg: variables['secondary-text-color'] || '#ffffff',
    bg: variables['secondary-color'] || '#6c757d',
    textSize: 'normal' as const
},
                },
                // Accent text on accent background
                {
                    name: 'accent-text-on-accent-bg',
                    fg: variables['accent-text-color'] || '#ffffff',
                    bg: variables['accent-color'] || '#28a745',
                    textSize: 'normal' as const
                },
                // Body text on surface background
                {
                    name: 'body-text-on-surface',
                    fg: variables['body-text-color'] || '#212529',
                    bg: variables['surface-color'] || '#ffffff',
                    textSize: 'normal' as const
                },
                // Large text variations (can use lower contrast ratio)
                {
                    name: 'heading-text-on-surface',
                    fg: variables['heading-text-color'] || '#212529',
                    bg: variables['surface-color'] || '#ffffff',
                    textSize: 'large' as const
                }
            ];

            for (const pair of pairs) {
                const ratio = this.calculateRatio(pair.fg, pair.bg);
                const required = pair.textSize === 'large' ? this.WCAG_AA_LARGE : this.WCAG_AA_NORMAL;

                if (ratio < required) {
                    violations.push({
                        pair: pair.name,
                        ratio: Math.round(ratio * 100) / 100, // Round to 2 decimal places
                        required,
                        colors: [pair.fg, pair.bg],
                        textSize: pair.textSize
                    });
                }
            }

            return {
                valid: violations.length === 0,
                violations
            };
        }

        /**
         * Suggest a compliant color by adjusting the foreground color
         * to meet contrast requirements with the background
         */
    suggestCompliant(foreground: string, background: string, textSize: TextSize = 'normal'): {
            suggested: string;
            originalRatio: number;
            newRatio: number;
            adjustments: number;
        } {
            // Normalise case
            foreground = foreground.toLowerCase();
            background = background.toLowerCase();

            const hexRegex = /^#([0-9a-f]{6})$/i;
            if (!hexRegex.test(foreground)) {
                throw new Error('Invalid foreground color format');
            }
            if (!hexRegex.test(background)) {
                throw new Error('Invalid background color format');
            }

            const required = textSize === 'large' ? this.WCAG_AA_LARGE : this.WCAG_AA_NORMAL;
            const originalRatio = this.calculateRatio(foreground, background);
            if (originalRatio >= required) {
                return { suggested: foreground, originalRatio, newRatio: originalRatio, adjustments: 0 };
            }

            // Determine adjustment direction: if background is light, darken foreground; if dark, lighten foreground
            const bgLum = this.getLuminance(background);
            const fgLum = this.getLuminance(foreground);
            const makeDarker = bgLum > fgLum; // if fg lighter than bg we need to darken; with light bg typical

            let currentRgb = this.hexToRgb(foreground)!;
            let adjustments = 0;
            let bestHex = foreground;
            let bestRatio = originalRatio;

            const step = 8; // adjust each channel by this many values per iteration
            for (let i = 0; i < 60; i++) { // cap iterations
                adjustments++;
                currentRgb = {
                    r: Math.max(0, Math.min(255, currentRgb.r + (makeDarker ? -step : step))),
                    g: Math.max(0, Math.min(255, currentRgb.g + (makeDarker ? -step : step))),
                    b: Math.max(0, Math.min(255, currentRgb.b + (makeDarker ? -step : step)))
                };
                const candidateHex = `#${currentRgb.r.toString(16).padStart(2, '0')}${currentRgb.g.toString(16).padStart(2, '0')}${currentRgb.b.toString(16).padStart(2, '0')}`;
                const ratio = this.calculateRatio(candidateHex, background);
                if (ratio > bestRatio) {
                    bestRatio = ratio;
                    bestHex = candidateHex;
                }
                if (ratio >= required) {
                    return { suggested: candidateHex, originalRatio, newRatio: ratio, adjustments };
                }
                // Stop if we reached bounds (pure black or pure white)
                if ((makeDarker && currentRgb.r === 0 && currentRgb.g === 0 && currentRgb.b === 0) ||
                    (!makeDarker && currentRgb.r === 255 && currentRgb.g === 255 && currentRgb.b === 255)) {
                    break;
                }
            }

            // Could not reach required; return best effort
            return { suggested: bestHex, originalRatio, newRatio: bestRatio, adjustments };
        }

    }
    }
}

module.exports = new Services.Contrast().exports();
