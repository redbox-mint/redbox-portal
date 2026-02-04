declare module 'sails' {
  export type Sails = globalThis.Sails.Application;
  export type Request = globalThis.Sails.Req;
  export type Response = globalThis.Sails.Res;
  export type Model<T = unknown> = globalThis.Sails.Model<T>;
}

export {};
