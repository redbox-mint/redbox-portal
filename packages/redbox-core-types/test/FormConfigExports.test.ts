import { expect } from 'chai';
import { FormConfigExports } from '../src';

describe('FormConfigExports', function () {
  it('should expose default form config', function () {
    expect(FormConfigExports).to.be.an('object');
    expect(FormConfigExports).to.have.property('default-1.0-draft');
  });
});
