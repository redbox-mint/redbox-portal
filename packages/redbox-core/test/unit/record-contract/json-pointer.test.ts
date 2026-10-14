import { expect } from 'chai';

import {
  appendRecordContractPointer,
  escapeRecordContractPointerToken,
  isRecordContractPointer,
  joinRecordContractPointer,
  parentRecordContractPointer,
  recordContractPointer,
  recordContractPointerFromTokens,
  recordContractPointerTokens,
} from '../../../src';

describe('record-contract JSON Pointer utilities', function () {
  it('matches RFC 6901 escaping and round-trips root, empty, slash, tilde, and numeric-looking keys', function () {
    const pointer = recordContractPointerFromTokens(['a/b', 'm~n', '', '01']);

    expect(pointer).to.equal('/a~1b/m~0n//01');
    expect(recordContractPointerTokens(pointer)).to.deep.equal(['a/b', 'm~n', '', '01']);
    expect(recordContractPointerFromTokens([])).to.equal('');
    expect(escapeRecordContractPointerToken('~1/')).to.equal('~01~1');
  });

  it('joins and finds parents without manually concatenating unescaped tokens', function () {
    const child = joinRecordContractPointer(recordContractPointer('/parent'), 'a/b');

    expect(child).to.equal('/parent/a~1b');
    expect(appendRecordContractPointer(child, recordContractPointer('/nested~1key'))).to.equal(
      '/parent/a~1b/nested~1key'
    );
    expect(parentRecordContractPointer(child)).to.equal('/parent');
    expect(parentRecordContractPointer(recordContractPointer(''))).to.equal('');
  });

  it('rejects malformed pointers and malformed escape sequences', function () {
    for (const value of ['not/a/pointer', '/bad~', '/bad~2escape', 1, null]) {
      expect(isRecordContractPointer(value)).to.equal(false);
    }
    expect(() => recordContractPointer('/bad~2escape')).to.throw('Invalid RFC 6901 JSON Pointer');
  });
});
