/** Small schema constructors shared by the integration configuration contracts. */
export const text = (name: string, values?: string[]) => ({ type: 'string', title: `admin-config-label-${name}`, ...(values ? { enum: values } : {}) });
export const flag = (name: string) => ({ type: 'boolean', title: `admin-config-label-${name}` });
export const number = (name: string) => ({ type: 'number', title: `admin-config-label-${name}` });
export const list = (name: string, items: object) => ({ type: 'array', title: `admin-config-label-${name}`, items });
export const object = (name: string, properties: Record<string, object>, required?: string[]) => ({ type: 'object', title: `admin-config-label-${name}`, properties, ...(required ? { required } : {}) });
export const dictionary = (name: string, value: object) => ({ type: 'object', title: `admin-config-label-${name}`, additionalProperties: value });
