import {
  FormValidatorConfig,
  formValidatorsSharedDefinitions,
  SimpleServerFormValidatorControl,
  ValidatorsSupport,
} from "../../src";

describe("aggregateMaxLength", () => {
  let expect: Chai.ExpectStatic;
  before(async () => {
    expect = (await import("chai")).expect;
  });

  function create(config: FormValidatorConfig["config"], message?: string) {
    const support = new ValidatorsSupport();
    return support.createFormValidatorInstancesFromMapping(
      support.createValidatorDefinitionMapping(formValidatorsSharedDefinitions),
      [{ class: "aggregateMaxLength", config, message }],
    ).syncDefs[0];
  }

  const cases: {
    title: string;
    value: unknown;
    config?: FormValidatorConfig["config"];
    length: number;
  }[] = [
    { title: "joins strings with the default separator", value: ["ab", "cd"], length: 6 },
    { title: "extracts object properties", value: [{ name: "ab" }, { name: "cd" }], config: { valuePath: "name" }, length: 6 },
    { title: "extracts nested properties", value: [{ person: { name: "abc" } }, { person: { name: "de" } }], config: { valuePath: "person.name" }, length: 7 },
    { title: "supports array indices in paths", value: [{ names: ["abc"] }, { names: ["de"] }], config: { valuePath: "names[0]" }, length: 7 },
    { title: "counts custom separators", value: ["a", "b", "c"], config: { separator: " / " }, length: 9 },
    { title: "supports an empty separator", value: ["ab", "cd"], config: { separator: "" }, length: 4 },
    { title: "trims and ignores empty values by default", value: [" ab ", " ", null, undefined, "cd", ""], length: 6 },
    { title: "can preserve whitespace", value: [" a ", " "], config: { trim: false }, length: 6 },
    { title: "can preserve empty slots and their separators", value: ["a", null, "", undefined, "b"], config: { ignoreEmpty: false }, length: 10 },
    { title: "counts separators between preserved empty slots", value: [null, ""], config: { ignoreEmpty: false }, length: 2 },
    { title: "keeps duplicates by default", value: ["ab", "ab"], length: 6 },
    { title: "deduplicates after trimming", value: [" ab ", "ab", "cd"], config: { distinct: true }, length: 6 },
    { title: "deduplicates extracted values", value: [{ name: "ab" }, { name: " ab " }], config: { distinct: true, valuePath: "name" }, length: 2 },
    { title: "keeps case-sensitive distinct values", value: ["AB", "ab"], config: { distinct: true }, length: 6 },
    { title: "normalizes before removing duplicates", value: [1, "1", false, "false"], config: { distinct: true }, length: 8 },
    { title: "retains zero and false", value: [0, false, true, 12], length: 18 },
    { title: "ignores missing nested properties", value: [null, {}, { person: null }, { person: { name: "a" } }], config: { valuePath: "person.name" }, length: 1 },
    { title: "treats non-primitive row values as empty", value: [{}, ["abc"], "ab"], length: 2 },
    { title: "uses the same UTF-16 length as maxLength", value: ["😀", "é"], length: 5 },
    { title: "allows null aggregates", value: null, length: 0 },
    { title: "allows absent aggregates", value: undefined, length: 0 },
    { title: "allows empty arrays", value: [], length: 0 },
    { title: "allows normalized empty arrays", value: [null, undefined, "", "  "], length: 0 },
    { title: "ignores non-array controls", value: { name: "abc" }, length: 0 },
  ];

  for (const { title, value, config, length } of cases) {
    it(title, () => {
      const control = new SimpleServerFormValidatorControl(value);
      expect(create({ ...config, maxLength: length })(control)).to.equal(null);
      expect(create({ ...config, maxLength: length + 1 })(control)).to.equal(null);
      if (length > 0) {
        expect(create({ ...config, maxLength: length - 1 })(control)).to.deep.equal({
          aggregateMaxLength: {
            message: "@validator-error-aggregate-max-length",
            params: { requiredLength: length - 1, actualLength: length },
          },
        });
      }
    });
  }

  it("honors custom messages without mutating row values", () => {
    const value = Object.freeze([Object.freeze({ name: " ab " }), Object.freeze({ name: "ab" })]);
    const result = create({ maxLength: 1, valuePath: "name", distinct: true }, "@custom-message")(
      new SimpleServerFormValidatorControl(value),
    );
    expect(result?.aggregateMaxLength).to.deep.equal({
      message: "@custom-message",
      params: { requiredLength: 1, actualLength: 2 },
    });
    expect(value[0].name).to.equal(" ab ");
  });

  for (const maxLength of [undefined, null, "invalid", -1, 1.5, Infinity]) {
    it(`rejects an invalid maximum: ${maxLength}`, () => {
      expect(() => create({ maxLength })).to.throw();
    });
  }
});
