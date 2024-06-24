export function PopulateExportedMethods <T extends { new (...args: any[]): {} }>(constructor: T) {
  return class extends constructor {
    _exportedMethods: any =Object.getOwnPropertyNames(constructor.prototype)
    .filter(prop => prop !== 'constructor' && typeof this[prop] === 'function');
  };
}