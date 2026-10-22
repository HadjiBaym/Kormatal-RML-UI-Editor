/** Bounded network fetch used by the ZIP exporter. */
export async function fetchResourceWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit = {},
  timeoutMs = 15_000,
  resourceLabel = 'ресурс',
): Promise<Response> {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1) {
    throw new RangeError('Тайм-аут загрузки ресурса должен быть положительным числом.');
  }
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const timeoutLabel = timeoutMs >= 1000 && timeoutMs % 1000 === 0 ? `${timeoutMs / 1000} с` : `${timeoutMs} мс`;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      controller.abort();
      reject(new Error(`Тайм-аут загрузки ${resourceLabel}: ожидание превысило ${timeoutLabel}.`));
    }, timeoutMs);
  });
  try {
    const request = fetch(input, { ...init, signal: controller.signal });
    return await Promise.race([request, timeout]);
  } catch (error) {
    if (timedOut) {
      throw error instanceof Error ? error : new Error(`Тайм-аут загрузки ${resourceLabel}.`);
    }
    if (controller.signal.aborted) {
      throw new Error(`Загрузка ${resourceLabel} отменена.`);
    }
    throw error;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

/** Bounds response-body reads as fetch() itself only waits for response headers. */
export async function promiseWithTimeout<T>(
  operation: Promise<T>,
  timeoutMs: number,
  resourceLabel = 'ответа ресурса',
  onTimeout?: () => void,
): Promise<T> {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1) {
    throw new RangeError('Тайм-аут чтения ресурса должен быть положительным числом.');
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  let timedOut = false;
  const timeoutLabel = timeoutMs >= 1000 && timeoutMs % 1000 === 0 ? `${timeoutMs / 1000} с` : `${timeoutMs} мс`;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => {
      timedOut = true;
      try { onTimeout?.(); } catch { /* best-effort cancellation */ }
      reject(new Error(`Тайм-аут чтения ${resourceLabel}: ожидание превысило ${timeoutLabel}.`));
    }, timeoutMs);
  });
  try {
    return await Promise.race([operation, timeout]);
  } catch (error) {
    if (timedOut) throw error instanceof Error ? error : new Error(`Тайм-аут чтения ${resourceLabel}.`);
    throw error;
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}
