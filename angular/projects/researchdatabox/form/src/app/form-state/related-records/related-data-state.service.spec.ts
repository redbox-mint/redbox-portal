import { RelatedDataStateService } from './related-data-state.service';

describe('RelatedDataStateService', () => {
  it('isolates forms and releases cancelled work idempotently', () => {
    const first = new RelatedDataStateService();
    const second = new RelatedDataStateService();
    const old = first.begin();
    const current = first.begin();
    old(); old();
    expect(first.state).toBe('pending');
    expect(second.state).toBe('ready');
    current(); old();
    expect(first.state).toBe('ready');
  });

  it('fails required incomplete sources and allows optional failures and recovery', () => {
    const state = new RelatedDataStateService();
    state.result('/optional', false, { status: 'failed', records: [], issues: [] });
    expect(state.state).toBe('ready');
    state.result('/required', true, { status: 'empty', records: [], issues: [] });
    expect(state.state).toBe('error');
    const release = state.begin();
    state.result('/required', true);
    expect(state.state).toBe('pending');
    state.result('/required', true, { status: 'resolved', records: [{ redboxOid: 'A', metadata: {},
      metaMetadata: { type: 'activity', brandId: 'default' } }], issues: [] });
    release();
    expect(state.state).toBe('ready');
    state.remove('/required');
    expect(state.hasSource('/required')).toBeFalse();
  });
});
