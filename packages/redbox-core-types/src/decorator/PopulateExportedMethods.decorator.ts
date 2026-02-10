// eslint-disable-next-line @typescript-eslint/no-explicit-any -- required for mixin pattern per TS handbook
export function PopulateExportedMethods <T extends { new (...args: any[]): {} }>(constructor: T) {
  if(process.env["sails_redbox__mochaTesting"] !== "true") {
    const ExtendedClass = class extends constructor {
      _exportedMethods: string[] = Object.getOwnPropertyNames(constructor.prototype)
        .filter(prop => prop !== 'constructor' && prop[0] !== '_' && typeof (this as Record<string, unknown>)[prop] === 'function');
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
