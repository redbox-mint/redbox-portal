let expect: Chai.ExpectStatic;
import("chai").then(mod => expect = mod.expect);
import { FormConfigExports } from '../src';

describe('FormConfigExports', function () {
  it('should expose default form config', function () {
    expect(FormConfigExports).to.be.an('object');
    expect(FormConfigExports).to.have.property('default-1.0-draft');
  });
});
