import { decycleObjectForJSONata, queryJSONata, JSONataQuerySource } from '../../src/';
import { expect } from "chai";
describe('query-helpers', () => {
  describe('decycleObject', () => {
    it('should copy a simple object', () => {
      const obj = { a: 1, b: 'test' };
      const result = decycleObjectForJSONata(obj);
      expect(result).to.deep.equal(obj);
      expect(result).to.not.equal(obj); // Should be a copy
    });

    it('should remove circular references', () => {
      const obj: any = { name: 'root' };
      obj.child = { parent: obj };
      
      const result = decycleObjectForJSONata(obj);
      // The circular reference 'parent' should be removed
      expect(result).to.deep.equal({ name: 'root', child: {} });
    });

    it('should remove functions', () => {
      const obj = { 
        name: 'keep', 
        fn: () => {} 
      };
      const result = decycleObjectForJSONata(obj);
      expect(result).to.deep.equal({ name: 'keep' });
    });
  });

  describe('queryJSONata', () => {
    it('should execute a simple query', async () => {
      const source: JSONataQuerySource = {
        queryOrigSource: {},
        jsonPointerSource: {},
        querySource: [
          { name: 'field1', jsonPointer: '/some/pointer' }
        ]
      };
      
      // jsonata evaluate can return a Promise
      const result = await queryJSONata(source, "$[name='field1'].jsonPointer");
      expect(result).to.equal('/some/pointer');
    });

    it('should handle complex queries', async () => {
       const source: JSONataQuerySource = {
        queryOrigSource: {},
        jsonPointerSource: {},
        querySource: [
          { name: 'field1', children: [{ name: 'c1' }, { name: 'c2' }] },
          { name: 'field2', children: [{ name: 'c3' }] }
        ]
      };
      
      const result = await queryJSONata(source, "$sum($[].children.$count($))");
      expect(result).to.equal(3);
    });
  });
});
