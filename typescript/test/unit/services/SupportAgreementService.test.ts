/* eslint-disable no-unused-expressions */
import { expect } from 'chai';
import { firstValueFrom } from 'rxjs';

declare var SupportAgreementService: any;
declare var SupportAgreement: any;
declare var BrandingService: any;
declare var BrandingConfig: any;

interface SupportAgreementRecord {
  id?: string;
  branding?: string;
  year: number;
  agreedSupportDays: number;
  usedSupportDays?: number;
  releaseNotes?: any[];
  timesheetSummary?: any[];
  createdAt?: Date;
  updatedAt?: Date;
}

describe('The SupportAgreementService', function () {
  let testBrandId: string;
  const testYear = 2199; // Use a far-future year to avoid conflicts
  const testYear2 = 2198;

  before(async function () {
    // Get the default brand for testing
    const brand = BrandingService.getDefault();
    const brandConfig = await BrandingConfig.findOne({ name: brand.name });
    testBrandId = brandConfig.id;
  });

  afterEach(async function () {
    // Clean up test data after each test
    await SupportAgreement.destroy({ year: { '>=': 2190 } });
  });

  describe('create()', function () {
    it('should create a new support agreement with minimal data', async function () {
      const result = await firstValueFrom(SupportAgreementService.create(testBrandId, testYear, {
        agreedSupportDays: 10
      }));

      expect(result).to.have.property('id');
      expect(result).to.have.property('year', testYear);
      expect(result).to.have.property('agreedSupportDays', 10);
      expect(result).to.have.property('usedSupportDays', 0);
      expect(result).to.have.property('releaseNotes').that.is.an('array').with.length(0);
      expect(result).to.have.property('timesheetSummary').that.is.an('array').with.length(0);
    });

    it('should create a support agreement with full data', async function () {
      const releaseNotes = [
        { title: 'v1.0 Release', date: '2024-01-15', summary: 'Initial release' },
        { title: 'v1.1 Release', date: '2024-03-20', url: 'https://example.com/release' }
      ];
      const timesheetSummary = [
        { summary: 'January Support', days: 2.5 },
        { summary: 'February Support', days: 1.5 }
      ];

      const result: SupportAgreementRecord = await firstValueFrom(SupportAgreementService.create(testBrandId, testYear, {
        agreedSupportDays: 15,
        releaseNotes: releaseNotes,
        timesheetSummary: timesheetSummary
      }));

      expect(result).to.have.property('agreedSupportDays', 15);
      expect(result).to.have.property('usedSupportDays', 4); // 2.5 + 1.5
      expect(result.releaseNotes).to.deep.equal(releaseNotes);
      expect(result.timesheetSummary).to.deep.equal(timesheetSummary);
    });

    it('should reject creation with invalid year', async function () {
      let error: Error | null = null;
      try {
        await firstValueFrom(SupportAgreementService.create(testBrandId, 1800, {
          agreedSupportDays: 10
        }));
      } catch (e) {
        error = e as Error;
      }
      expect(error).to.exist;
      expect(error!.message).to.match(/Year must be a valid integer/);
    });

    it('should reject creation with negative agreedSupportDays', async function () {
      let error: Error | null = null;
      try {
        await firstValueFrom(SupportAgreementService.create(testBrandId, testYear, {
          agreedSupportDays: -5
        }));
      } catch (e) {
        error = e as Error;
      }
      expect(error).to.exist;
      expect(error!.message).to.match(/agreedSupportDays must be a non-negative number/);
    });

    it('should reject creation with negative days in timesheetSummary', async function () {
      let error: Error | null = null;
      try {
        await firstValueFrom(SupportAgreementService.create(testBrandId, testYear, {
          agreedSupportDays: 10,
          timesheetSummary: [{ summary: 'Invalid', days: -1 }]
        }));
      } catch (e) {
        error = e as Error;
      }
      expect(error).to.exist;
      expect(error!.message).to.match(/non-negative days value/);
    });
  });

  describe('getByBrandAndYear()', function () {
    it('should return null for non-existent agreement', async function () {
      const result = await firstValueFrom(SupportAgreementService.getByBrandAndYear(testBrandId, testYear));
      expect(result).to.be.null;
    });

    it('should return agreement with derived usedSupportDays', async function () {
      // First create an agreement
      await firstValueFrom(SupportAgreementService.create(testBrandId, testYear, {
        agreedSupportDays: 20,
        timesheetSummary: [
          { summary: 'Task 1', days: 3 },
          { summary: 'Task 2', days: 2.5 },
          { summary: 'Task 3', days: 4.5 }
        ]
      }));

      const result = await firstValueFrom(SupportAgreementService.getByBrandAndYear(testBrandId, testYear));

      expect(result).to.not.be.null;
      expect(result).to.have.property('year', testYear);
      expect(result).to.have.property('agreedSupportDays', 20);
      expect(result).to.have.property('usedSupportDays', 10); // 3 + 2.5 + 4.5
    });
  });

  describe('getByBrand()', function () {
    it('should return empty array when no agreements exist', async function () {
      const result: SupportAgreementRecord[] = await firstValueFrom(SupportAgreementService.getByBrand(testBrandId));
      // Filter to only test years to avoid conflicts with other tests
      const testResults = result.filter((r: any) => r.year >= 2190);
      expect(testResults).to.be.an('array').with.length(0);
    });

    it('should return all agreements for a brand sorted by year descending', async function () {
      // Create multiple agreements
      await firstValueFrom(SupportAgreementService.create(testBrandId, testYear2, { agreedSupportDays: 8 }));
      await firstValueFrom(SupportAgreementService.create(testBrandId, testYear, { agreedSupportDays: 10 }));

      const result: SupportAgreementRecord[] = await firstValueFrom(SupportAgreementService.getByBrand(testBrandId));
      const testResults = result.filter((r: any) => r.year >= 2190);

      expect(testResults).to.be.an('array').with.length(2);
      expect(testResults[0].year).to.equal(testYear); // 2199 first (descending)
      expect(testResults[1].year).to.equal(testYear2); // 2198 second
    });
  });

  describe('getAvailableYears()', function () {
    it('should return empty array when no agreements exist', async function () {
      const result: number[] = await firstValueFrom(SupportAgreementService.getAvailableYears(testBrandId));
      const testResults = result.filter((y: number) => y >= 2190);
      expect(testResults).to.be.an('array').with.length(0);
    });

    it('should return array of years sorted descending', async function () {
      await firstValueFrom(SupportAgreementService.create(testBrandId, testYear2, { agreedSupportDays: 8 }));
      await firstValueFrom(SupportAgreementService.create(testBrandId, testYear, { agreedSupportDays: 10 }));

      const result: number[] = await firstValueFrom(SupportAgreementService.getAvailableYears(testBrandId));
      const testResults = result.filter((y: number) => y >= 2190);

      expect(testResults).to.deep.equal([testYear, testYear2]); // [2199, 2198]
    });
  });

  describe('update()', function () {
    it('should update agreedSupportDays', async function () {
      await firstValueFrom(SupportAgreementService.create(testBrandId, testYear, { agreedSupportDays: 10 }));

      const result = await firstValueFrom(SupportAgreementService.update(testBrandId, testYear, {
        agreedSupportDays: 15
      }));

      expect(result).to.have.property('agreedSupportDays', 15);
    });

    it('should update releaseNotes', async function () {
      await firstValueFrom(SupportAgreementService.create(testBrandId, testYear, { agreedSupportDays: 10 }));

      const newReleaseNotes = [{ title: 'New Release', date: '2024-06-01', summary: 'Added feature X' }];
      const result: SupportAgreementRecord = await firstValueFrom(SupportAgreementService.update(testBrandId, testYear, {
        releaseNotes: newReleaseNotes
      }));

      expect(result.releaseNotes).to.deep.equal(newReleaseNotes);
    });

    it('should update timesheetSummary and recalculate usedSupportDays', async function () {
      await firstValueFrom(SupportAgreementService.create(testBrandId, testYear, {
        agreedSupportDays: 10,
        timesheetSummary: [{ summary: 'Old Task', days: 2 }]
      }));

      const newTimesheetSummary = [
        { summary: 'New Task 1', days: 5 },
        { summary: 'New Task 2', days: 3 }
      ];
      const result: SupportAgreementRecord = await firstValueFrom(SupportAgreementService.update(testBrandId, testYear, {
        timesheetSummary: newTimesheetSummary
      }));

      expect(result.timesheetSummary).to.deep.equal(newTimesheetSummary);
      expect(result.usedSupportDays).to.equal(8); // 5 + 3
    });

    it('should throw error when agreement does not exist', async function () {
      let error: Error | null = null;
      try {
        await firstValueFrom(SupportAgreementService.update(testBrandId, testYear, {
          agreedSupportDays: 15
        }));
      } catch (e) {
        error = e as Error;
      }
      expect(error).to.exist;
      expect(error!.message).to.match(/not found/);
    });

    it('should reject update with invalid data', async function () {
      await firstValueFrom(SupportAgreementService.create(testBrandId, testYear, { agreedSupportDays: 10 }));

      let error: Error | null = null;
      try {
        await firstValueFrom(SupportAgreementService.update(testBrandId, testYear, {
          agreedSupportDays: -5
        }));
      } catch (e) {
        error = e as Error;
      }
      expect(error).to.exist;
      expect(error!.message).to.match(/non-negative/);
    });
  });

  describe('remove()', function () {
    it('should remove an existing agreement and return the deleted record', async function () {
      await firstValueFrom(SupportAgreementService.create(testBrandId, testYear, { agreedSupportDays: 10 }));

      const result = await firstValueFrom(SupportAgreementService.remove(testBrandId, testYear));

      expect(result).to.have.property('year', testYear);

      // Verify it's actually deleted
      const check = await firstValueFrom(SupportAgreementService.getByBrandAndYear(testBrandId, testYear));
      expect(check).to.be.null;
    });

    it('should return undefined when agreement does not exist', async function () {
      const result = await firstValueFrom(SupportAgreementService.remove(testBrandId, testYear));
      expect(result).to.be.undefined;
    });
  });

  describe('computeUsedDays()', function () {
    it('should return 0 for empty array', function () {
      const result = SupportAgreementService.computeUsedDays([]);
      expect(result).to.equal(0);
    });

    it('should return 0 for undefined/null', function () {
      expect(SupportAgreementService.computeUsedDays(undefined)).to.equal(0);
      expect(SupportAgreementService.computeUsedDays(null)).to.equal(0);
    });

    it('should sum all days correctly', function () {
      const result = SupportAgreementService.computeUsedDays([
        { summary: 'Task 1', days: 1.5 },
        { summary: 'Task 2', days: 2.5 },
        { summary: 'Task 3', days: 3 }
      ]);
      expect(result).to.equal(7);
    });

    it('should handle items with non-numeric days', function () {
      const result = SupportAgreementService.computeUsedDays([
        { summary: 'Task 1', days: 2 },
        { summary: 'Task 2', days: 'invalid' as any },
        { summary: 'Task 3', days: 3 }
      ]);
      expect(result).to.equal(5); // 2 + 0 + 3
    });
  });

  describe('validateAgreement()', function () {
    it('should return null for valid data', function () {
      const result = SupportAgreementService.validateAgreement(2024, 10, [{ summary: 'Task', days: 2 }]);
      expect(result).to.be.null;
    });

    it('should reject year below 1900', function () {
      const result = SupportAgreementService.validateAgreement(1800, 10);
      expect(result).to.match(/Year must be a valid integer/);
    });

    it('should reject year above 2200', function () {
      const result = SupportAgreementService.validateAgreement(2300, 10);
      expect(result).to.match(/Year must be a valid integer/);
    });

    it('should reject non-integer year', function () {
      const result = SupportAgreementService.validateAgreement(2024.5, 10);
      expect(result).to.match(/Year must be a valid integer/);
    });

    it('should reject negative agreedSupportDays', function () {
      const result = SupportAgreementService.validateAgreement(2024, -1);
      expect(result).to.match(/non-negative number/);
    });

    it('should reject negative days in timesheetSummary', function () {
      const result = SupportAgreementService.validateAgreement(2024, 10, [{ summary: 'Task', days: -1 }]);
      expect(result).to.match(/non-negative days value/);
    });
  });

  describe('withDerivedTotals()', function () {
    it('should add usedSupportDays field', function () {
      const record = {
        id: 'test-id',
        branding: testBrandId,
        year: 2024,
        agreedSupportDays: 10,
        releaseNotes: [],
        timesheetSummary: [
          { summary: 'Task 1', days: 3 },
          { summary: 'Task 2', days: 2 }
        ],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = SupportAgreementService.withDerivedTotals(record);

      expect(result).to.have.property('usedSupportDays', 5);
      expect(result).to.have.property('id', 'test-id');
      expect(result).to.have.property('year', 2024);
    });

    it('should handle missing timesheetSummary', function () {
      const record = {
        id: 'test-id',
        branding: testBrandId,
        year: 2024,
        agreedSupportDays: 10,
        createdAt: new Date(),
        updatedAt: new Date()
      };

      const result = SupportAgreementService.withDerivedTotals(record);

      expect(result).to.have.property('usedSupportDays', 0);
      expect(result).to.have.property('releaseNotes').that.is.an('array');
      expect(result).to.have.property('timesheetSummary').that.is.an('array');
    });
  });
});
