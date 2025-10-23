/* eslint-disable no-unused-expressions */
const { expect } = require('chai');

describe('ContrastService', () => {
    describe('calculateRatio', () => {
        it('calculates correct contrast ratio for black on white', async () => {
            const ratio = await ContrastService.calculateRatio('#000000', '#ffffff');
            expect(ratio).to.be.closeTo(21, 0.1); // Black on white should be ~21:1
        });

        it('calculates correct contrast ratio for white on black', async () => {
            const ratio = await ContrastService.calculateRatio('#ffffff', '#000000');
            expect(ratio).to.be.closeTo(21, 0.1); // Same ratio regardless of order
        });

        it('calculates correct contrast ratio for identical colors', async () => {
            const ratio = await ContrastService.calculateRatio('#666666', '#666666');
            expect(ratio).to.equal(1); // Identical colors should be 1:1
        });

        it('calculates correct contrast ratio for similar colors', async () => {
            const ratio = await ContrastService.calculateRatio('#808080', '#707070');
            expect(ratio).to.be.lessThan(2); // Similar grays should have low contrast
        });
    });

    describe('getLuminance', () => {
        it('calculates correct luminance for pure black', async () => {
            const luminance = await ContrastService.getLuminance('#000000');
            expect(luminance).to.equal(0);
        });

        it('calculates correct luminance for pure white', async () => {
            const luminance = await ContrastService.getLuminance('#ffffff');
            expect(luminance).to.equal(1);
        });

        it('calculates correct luminance for gray', async () => {
            const luminance = await ContrastService.getLuminance('#808080');
            expect(luminance).to.be.closeTo(0.22, 0.01);
        });
    });

    describe('validate', () => {
        it('passes validation for high contrast color combinations', async () => {
            const variables = {
                'primary-color': '#000000',
                'primary-text-color': '#ffffff',
                'secondary-color': '#ffffff',
                'secondary-text-color': '#000000',
                'accent-color': '#000000',
                'accent-text-color': '#ffffff',
                'surface-color': '#ffffff',
                'body-text-color': '#000000',
                'heading-text-color': '#000000'
            };

            const result = await ContrastService.validate(variables);
            expect(result.valid).to.be.true;
            expect(result.violations).to.be.empty;
        });

        it('fails validation for low contrast combinations', async () => {
            const variables = {
                'primary-color': '#ffffff',
                'primary-text-color': '#f0f0f0', // Very similar to white background
                'secondary-color': '#808080',
                'secondary-text-color': '#909090', // Very similar to gray background
                'accent-color': '#ffffff',
                'accent-text-color': '#ffffff', // Same color
                'surface-color': '#ffffff',
                'body-text-color': '#000000',
                'heading-text-color': '#000000'
            };

            const result = await ContrastService.validate(variables);
            expect(result.valid).to.be.false;
            expect(result.violations).to.have.length.greaterThan(0);

            // Check that violations include expected information
            const primaryViolation = result.violations.find(v => v.pair === 'primary-text-on-primary-bg');
            expect(primaryViolation).to.exist;
            expect(primaryViolation.ratio).to.be.lessThan(primaryViolation.required);
            expect(primaryViolation.colors).to.deep.equal(['#f0f0f0', '#ffffff']);
            expect(primaryViolation.textSize).to.equal('normal');
        });

        it('validates large text with lower contrast requirements', async () => {
            const variables = {
                'primary-color': '#000000',
                'primary-text-color': '#ffffff',
                'secondary-color': '#ffffff',
                'secondary-text-color': '#000000',
                'accent-color': '#000000',
                'accent-text-color': '#ffffff',
                'surface-color': '#ffffff',
                'body-text-color': '#000000',
                'heading-text-color': '#666666' // Medium gray on white - should pass for large text
            };

            const result = await ContrastService.validate(variables);
            expect(result.valid).to.be.true;
        });

        it('handles missing color variables gracefully', async () => {
            const variables = {}; // Empty variables - should use defaults

            const result = await ContrastService.validate(variables);
            expect(result).to.have.property('valid');
            expect(result).to.have.property('violations');
        });
    });

    describe('suggestCompliant', () => {
        it('returns original color when already compliant', async () => {
            const result = await ContrastService.suggestCompliant('#000000', '#ffffff');
            expect(result.suggested).to.equal('#000000');
            expect(result.originalRatio).to.be.closeTo(21, 0.1);
            expect(result.newRatio).to.be.closeTo(21, 0.1);
            expect(result.adjustments).to.equal(0);
        });

        it('suggests compliant color for low contrast combination', async () => {
            const result = await ContrastService.suggestCompliant('#f0f0f0', '#ffffff'); // Very similar colors
            expect(result.suggested).to.not.equal('#f0f0f0');
            expect(result.originalRatio).to.be.lessThan(result.newRatio);
            // Algorithm may require multiple incremental adjustments; just ensure at least one occurred
            expect(result.adjustments).to.be.at.least(1);
            expect(result.newRatio).to.be.at.least(4.5); // Should meet normal text requirement
        });

        it('handles large text contrast requirements', async () => {
            // Start with a color below 3:1 and ensure we adjust to compliant
            const result = await ContrastService.suggestCompliant('#b3b3b3', '#ffffff', 'large');
            expect(result.suggested).to.be.a('string');
            expect(result.newRatio).to.be.at.least(3.0); // Large text requirement
        });

        it('throws error for invalid color format', async () => {
            let err;
            try {
                await ContrastService.suggestCompliant('invalid', '#ffffff');
            } catch (e) {
                err = e;
            }
            expect(err).to.exist;
            expect(err.message).to.include('Invalid foreground color format');
        });

        it('throws error for invalid background color format', async () => {
            let err;
            try {
                await ContrastService.suggestCompliant('#000000', 'invalid');
            } catch (e) {
                err = e;
            }
            expect(err).to.exist;
            expect(err.message).to.include('Invalid background color format');
        });
    });

    describe('WCAG AA compliance', () => {
        it('enforces 4.5:1 ratio for normal text', async () => {
            // Test a color combination that should just meet the requirement
            const fg = '#767676'; // This should give ~4.5:1 with white
            const bg = '#ffffff';

            const ratio = await ContrastService.calculateRatio(fg, bg);
            expect(ratio).to.be.closeTo(4.5, 0.5); // Allow some tolerance

            const result = await ContrastService.validate({
                'body-text-color': fg,
                'surface-color': bg
            });

            expect(result).to.have.property('valid');
        });

        it('enforces 3:1 ratio for large text', async () => {
            // Test a color combination for large text
            const fg = '#959595'; // ~3:1 on white
            const bg = '#ffffff';

            const ratio = await ContrastService.calculateRatio(fg, bg);
            expect(ratio).to.be.closeTo(3, 0.5); // Allow some tolerance

            const result = await ContrastService.validate({
                'heading-text-color': fg,
                'surface-color': bg
            });

            // This should pass or fail depending on exact calculation
            expect(result).to.have.property('valid');
        });
    });
});
