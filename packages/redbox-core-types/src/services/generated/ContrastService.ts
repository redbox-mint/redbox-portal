// This file is generated from internal/sails-ts/api/services/ContrastService.ts. Do not edit directly.
import { Services as services } from '../../index';
import { PopulateExportedMethods } from '../../index';

declare const textSizes: any;
export type TextSize = typeof textSizes[number];
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

export interface ContrastService {
  validate(variables: Record<string, string>): {
            valid: boolean;
            violations: ContrastViolation[];
        };
  suggestCompliant(foreground: string, background: string, textSize?: TextSize): {
            suggested: string;
            originalRatio: number;
            newRatio: number;
            adjustments: number;
        };
  calculateRatio(colorA: string, colorB: string): number;
  getLuminance(color: string): number;
}
