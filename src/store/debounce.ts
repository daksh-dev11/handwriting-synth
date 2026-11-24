export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  ms: number,
): ((...args: A) => void) & { flush(): void; cancel(): void } {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let pending: A | undefined;

  const invoke = (): void => {
    if (!pending) return;
    const args = pending;
    pending = undefined;
    fn(...args);
  };

  const wrapped = ((...args: A): void => {
    pending = args;
    if (timer !== undefined) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = undefined;
      invoke();
    }, ms);
  }) as ((...args: A) => void) & { flush(): void; cancel(): void };

  wrapped.flush = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    invoke();
  };
  wrapped.cancel = (): void => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    pending = undefined;
  };

  return wrapped;
}
