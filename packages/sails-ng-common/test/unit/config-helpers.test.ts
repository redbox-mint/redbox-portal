import {arrayStartsWithArray} from "../../src";

let expect: Chai.ExpectStatic;

before(async () => {
  const chai = await import('chai');
  expect = chai.expect;
});

describe('arrayStartsWithArray', function () {
  const cases: { args: { base: unknown[], check: unknown[] }, expected: boolean }[] = [
    {args: {base: [1, 2], check: [1, 2, 3]}, expected: true},
    {args: {base: [1, 2], check: [1, 2]}, expected: true},
    {args: {base: ["1", "2"], check: [1, 2, 3]}, expected: false},
    {args: {base: ["1", "3"], check: ["1", "2", "3"]}, expected: false},
    {args: {base: ["1", "2"], check: ["1"]}, expected: false},
    {args: {base: null as unknown as unknown[], check: ["1"]}, expected: false},
    {args: {base: ["one"], check: undefined as unknown as unknown[]}, expected: false},
    {args: {base: [], check: undefined as unknown as unknown[]}, expected: false},
  ];
  cases.forEach(({args, expected}) => {
    it(`should return ${expected} for base ${args.base} and check ${args.check}`, function () {
      const result = arrayStartsWithArray(args.base, args.check);
      expect(result).to.eql(expected);
    });
  });
});
