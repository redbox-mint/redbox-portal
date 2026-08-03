/**
 * Race a promise against a timeout.
 *
 * Used by the bootstrap importers so that a hung remote call (RVA, Figshare) cannot
 * stall the Sails lift indefinitely. The underlying promise is not cancelled - it is
 * simply no longer awaited - so callers must treat a timeout as "outcome unknown".
 */
export async function promiseWithTimeout<T>(promise: Promise<T>, timeoutMs: number, label: string): Promise<T> {
  let timeoutHandle: NodeJS.Timeout | null = null;
  const timeoutPromise = new Promise<never>((_resolve, reject) => {
    timeoutHandle = setTimeout(() => {
      reject(new Error(`${label} timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutHandle) {
      clearTimeout(timeoutHandle);
    }
  }
}
