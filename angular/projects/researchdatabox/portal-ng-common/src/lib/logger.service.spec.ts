import { LoggerService } from './logger.service';

describe('LoggerService', () => {
  const originalDebugFlag = (globalThis as any).__REDBOX_DEBUG__;

  afterEach(() => {
    if (typeof originalDebugFlag === 'undefined') {
      delete (globalThis as any).__REDBOX_DEBUG__;
    } else {
      (globalThis as any).__REDBOX_DEBUG__ = originalDebugFlag;
    }
  });

  it('should not call console.debug when __REDBOX_DEBUG__ is false', () => {
    (globalThis as any).__REDBOX_DEBUG__ = false;
    const consoleDebugSpy = spyOn(console, 'debug');
    const service = new LoggerService();

    service.debug('hidden debug log', { key: 'value' });

    expect(consoleDebugSpy).not.toHaveBeenCalled();
  });

  it('should call console.debug when __REDBOX_DEBUG__ is true', () => {
    (globalThis as any).__REDBOX_DEBUG__ = true;
    const consoleDebugSpy = spyOn(console, 'debug');
    const service = new LoggerService();

    service.debug('visible debug log', { key: 'value' });

    expect(consoleDebugSpy).toHaveBeenCalled();
  });

  it('should call console.debug by default in dev mode when no override is set', () => {
    delete (globalThis as any).__REDBOX_DEBUG__;
    const consoleDebugSpy = spyOn(console, 'debug');
    const service = new LoggerService();

    service.debug('default debug log', { key: 'value' });

    expect(consoleDebugSpy).toHaveBeenCalled();
  });

  it('should keep info, warn, and error logs enabled when debug is disabled', () => {
    (globalThis as any).__REDBOX_DEBUG__ = false;
    const consoleInfoSpy = spyOn(console, 'info');
    const consoleWarnSpy = spyOn(console, 'warn');
    const consoleErrorSpy = spyOn(console, 'error');
    const service = new LoggerService();

    service.info('info log');
    service.warn('warn log');
    service.error('error log');

    expect(consoleInfoSpy).toHaveBeenCalled();
    expect(consoleWarnSpy).toHaveBeenCalled();
    expect(consoleErrorSpy).toHaveBeenCalled();
  });

  it('should use a constant console format string when logging string plus data', () => {
    const consoleErrorSpy = spyOn(console, 'error');
    const service = new LoggerService();
    const data = { key: 'value' };

    service.error('user %s controlled', data);

    expect(consoleErrorSpy).toHaveBeenCalled();
    expect(consoleErrorSpy.calls.mostRecent().args[0]).toBe('%s');
    expect(consoleErrorSpy.calls.mostRecent().args[1]).toBe('user %s controlled');
  });
});
