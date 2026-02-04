export function PopulateExportedMethods <T extends { new (...args: any[]): {} }>(constructor: T) {
  if(process.env["sails_redbox__mochaTesting"] !== "true") {
    const ExtendedClass = class extends constructor {
      _exportedMethods: any = Object.getOwnPropertyNames(constructor.prototype)
        .filter(prop => prop !== 'constructor' && typeof (this as any)[prop] === 'function');
    };
    
    // Preserve the original class name so that the logger registration works correctly
    Object.defineProperty(ExtendedClass, 'name', {
      value: constructor.name,
      configurable: true
    });
    
    return ExtendedClass;
  } else {
    return constructor;
  }
}
