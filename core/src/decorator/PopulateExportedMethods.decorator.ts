export function PopulateExportedMethods <T extends { new (...args: any[]): {} }>(constructor: T) {
  if(process.env["sails_redbox__mochaTesting"] !== "true") {
  return class extends constructor {
    
      _exportedMethods: any =Object.getOwnPropertyNames(constructor.prototype)
      .filter(prop => prop !== 'constructor' && typeof this[prop] === 'function');
    };
  } else {
    return constructor;
  }
}