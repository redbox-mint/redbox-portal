import { TestBed } from '@angular/core/testing';

import { RedboxPortalCoreService } from './redbox-portal-core.service';

describe('RedboxPortalCoreService', () => {
  let service: RedboxPortalCoreService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(RedboxPortalCoreService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });
});
