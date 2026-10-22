/** Bound every hosted-viewer request: a disconnected iframe may never call back. */
export function projectionRequest<T>(
  operation: (callback: (error: unknown, value?: T) => void) => void,
  signal?: AbortSignal,
  message = '在线投影接口未响应，请重试。',
  timeoutMs = 8000,
): Promise<T> {
  return new Promise((resolve, reject) => {
    signal?.throwIfAborted();
    let settled = false;
    const finish = (error?: unknown, value?: T) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener('abort', abort);
      if (error) reject(error instanceof Error ? error : new Error(message));
      else resolve(value as T);
    };
    const abort = () => finish(new DOMException('投影任务已取消。', 'AbortError'));
    const timer = setTimeout(() => finish(new Error(message)), timeoutMs);
    signal?.addEventListener('abort', abort, { once: true });
    try {
      operation((error, value) => finish(error, value));
    } catch (error) {
      finish(error);
    }
  });
}

/** viewerready already includes base textures. Wait briefly for remaining HD updates,
 * but do not block on a completion event that cached viewers sometimes never emit. */
export function trackProjectionTextures() {
  let complete = false,
    lastChange = Date.now(),
    factor = 0;
  return {
    update(value: number) {
      if (!Number.isFinite(value)) return;
      factor = Math.max(factor, Math.min(1, Math.max(0, value)));
      lastChange = Date.now();
      complete ||= factor >= 1;
    },
    async wait(
      signal?: AbortSignal,
      onProgress?: (message: string) => void,
      maxWaitMs = 2500,
      quietMs = 700,
    ) {
      const start = Date.now();
      while (!complete && Date.now() - start < maxWaitMs && Date.now() - lastChange < quietMs) {
        onProgress?.(
          factor > 0 ? `正在完成底图纹理（${Math.round(factor * 100)}%）…` : '正在完成底图纹理…',
        );
        await projectionRequest<void>(
          (cb) => setTimeout(() => cb(null), Math.min(100, maxWaitMs)),
          signal,
          '纹理准备超时。',
          Math.max(500, maxWaitMs + 100),
        );
      }
      signal?.throwIfAborted();
    },
  };
}
