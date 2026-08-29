declare module '@sailshq/csurf' {
  import type { NextFunction, Request, Response } from 'express';

  interface CsrfOptions {
    ignoreMethods?: string[];
    sessionKey?: string;
  }

  function csrf(options?: CsrfOptions): (req: Request, res: Response, next: NextFunction) => void;
  export = csrf;
}
