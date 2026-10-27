/** Bound the wait without cancelling owned work; construct timeout errors only when needed. */
export async function withTimeout(work: Promise<void>, delayMs: number, errorFactory: () => Error): Promise<void> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      work,
      new Promise<never>((_resolve, reject) => {
        timer = setTimeout(() => reject(errorFactory()), delayMs);
      }),
    ]);
  } finally {
    clearTimeout(timer);
  }
}
