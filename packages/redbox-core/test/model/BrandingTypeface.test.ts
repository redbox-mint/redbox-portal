let expect: Chai.ExpectStatic;
import('chai').then(mod => (expect = mod.expect));
import {
  BRANDING_HISTORY_MAX_VERSIONS,
  BRANDING_TYPEFACE_FACE_MAX_BYTES,
  BRANDING_TYPEFACE_FAMILY_MAX_BYTES,
  BRANDING_TYPEFACE_ORPHAN_GRACE_MS,
  BRANDING_TYPEFACE_SLOTS,
  isBrandingTypefaceSlot,
  isDefaultTypefaceState,
  isPublishableTypefaceState,
  isValidActiveTypefaceState,
  isValidDraftTypefaceState,
  normalizeTypefaceState,
  orderedTypefaceFaces,
  type BrandingTypefaceFace,
  type BrandingTypefaceState,
} from '../../src/model/BrandingTypeface';
import { branding, getBrandingPositiveInt } from '../../src/config/branding.config';
import { BrandingConfigWLDef } from '../../src/waterline-models/BrandingConfig';
import { BrandingConfigHistoryWLDef } from '../../src/waterline-models/BrandingConfigHistory';

const VALID_SHA = 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855';

function face(
  slot: BrandingTypefaceFace['slot'] = 'regular',
  overrides: Partial<BrandingTypefaceFace> = {}
): BrandingTypefaceFace {
  return {
    slot,
    sha256: VALID_SHA,
    originalFilename: `${slot}.woff2`,
    sizeBytes: 1024,
    uploadedAt: new Date('2026-01-01T00:00:00.000Z').toISOString(),
    inspection: {},
    warnings: [],
    ...overrides,
  };
}

describe('BrandingTypeface contracts', function () {
  it('exposes fixed slot ordering and size/version defaults', function () {
    expect([...BRANDING_TYPEFACE_SLOTS]).to.deep.equal(['regular', 'bold', 'italic', 'boldItalic']);
    expect(BRANDING_TYPEFACE_FACE_MAX_BYTES).to.equal(2 * 1024 * 1024);
    expect(BRANDING_TYPEFACE_FAMILY_MAX_BYTES).to.equal(8 * 1024 * 1024);
    expect(BRANDING_HISTORY_MAX_VERSIONS).to.equal(3);
    expect(BRANDING_TYPEFACE_ORPHAN_GRACE_MS).to.equal(24 * 60 * 60 * 1000);
    expect(branding.typefaceFaceMaxBytes).to.equal(2 * 1024 * 1024);
    expect(branding.typefaceFamilyMaxBytes).to.equal(8 * 1024 * 1024);
    expect(branding.historyMaxVersions).to.equal(3);
    expect(branding.typefaceOrphanGraceMs).to.equal(24 * 60 * 60 * 1000);
  });

  it('normalises absent legacy typeface to Default Typography', function () {
    for (const input of [undefined, null, {}, { mode: 'default' }, { mode: 'weird' }]) {
      expect(normalizeTypefaceState(input)).to.deep.equal({ mode: 'default', faces: {} });
    }
    const custom = normalizeTypefaceState({ mode: 'custom', faces: { regular: face() } });
    expect(custom.mode).to.equal('custom');
    expect(isDefaultTypefaceState(custom)).to.equal(false);
  });

  it('validates slots and active/draft invariants', function () {
    expect(isBrandingTypefaceSlot('regular')).to.equal(true);
    expect(isBrandingTypefaceSlot('boldItalic')).to.equal(true);
    expect(isBrandingTypefaceSlot('medium')).to.equal(false);
    expect(isBrandingTypefaceSlot(undefined)).to.equal(false);

    const emptyDefault: BrandingTypefaceState = { mode: 'default', faces: {} };
    expect(isValidActiveTypefaceState(emptyDefault)).to.equal(true);
    expect(isValidDraftTypefaceState(emptyDefault)).to.equal(true);
    expect(isPublishableTypefaceState(emptyDefault)).to.equal(true);

    const draftWithoutRegular: BrandingTypefaceState = { mode: 'custom', faces: { bold: face('bold') } };
    expect(isValidDraftTypefaceState(draftWithoutRegular)).to.equal(true);
    expect(isValidActiveTypefaceState(draftWithoutRegular)).to.equal(false);
    expect(isPublishableTypefaceState(draftWithoutRegular)).to.equal(false);

    const active: BrandingTypefaceState = { mode: 'custom', faces: { regular: face() } };
    expect(isValidActiveTypefaceState(active)).to.equal(true);
    expect(isPublishableTypefaceState(active)).to.equal(true);

    const badHash: BrandingTypefaceState = {
      mode: 'custom',
      faces: { regular: face('regular', { sha256: 'NOTHEX' }) },
    };
    expect(isValidDraftTypefaceState(badHash)).to.equal(false);

    expect(
      orderedTypefaceFaces({ mode: 'custom', faces: { bold: face('bold'), regular: face() } }).map(f => f.slot)
    ).to.deep.equal(['regular', 'bold']);
  });

  it('falls back to defaults for invalid operator config with a logged warning', function () {
    const warnings: string[] = [];
    const prevSails = (globalThis as { sails?: unknown }).sails;
    (globalThis as { sails?: any }).sails = {
      config: { branding: { typefaceFaceMaxBytes: -5 } },
      log: { warn: (msg: string) => warnings.push(msg) },
    };
    try {
      expect(getBrandingPositiveInt('typefaceFaceMaxBytes', 10)).to.equal(10);
      expect(warnings.length).to.equal(1);
      (globalThis as { sails?: any }).sails.config.branding.typefaceFaceMaxBytes = 123;
      expect(getBrandingPositiveInt('typefaceFaceMaxBytes', 10)).to.equal(123);
    } finally {
      if (prevSails === undefined) {
        delete (globalThis as { sails?: unknown }).sails;
      } else {
        (globalThis as { sails?: unknown }).sails = prevSails;
      }
    }
  });

  it('declares typeface and revision fields on Waterline models', function () {
    const configAttrs = (BrandingConfigWLDef as { attributes?: Record<string, unknown> }).attributes ?? {};
    expect(configAttrs).to.have.property('typeface');
    expect(configAttrs).to.have.property('draftTypeface');
    expect(configAttrs).to.have.property('draftRevision');
    const historyAttrs = (BrandingConfigHistoryWLDef as { attributes?: Record<string, unknown> }).attributes ?? {};
    expect(historyAttrs).to.have.property('typeface');
    expect(historyAttrs).to.have.property('actorId');
    expect(historyAttrs).to.have.property('actorDisplayName');
    expect(historyAttrs).to.have.property('restoredFromVersion');
  });
});
