export type ResponseCacheStatus = "hit" | "miss";

export type ResponseCacheEntry<T> = {
  expiresAtMs: number;
  promise?: Promise<T>;
  value?: T;
};

export type ResponseCache<T = unknown> = Map<string, ResponseCacheEntry<T>>;

export type ReadThroughResponseCacheOptions<T> = {
  cache: ResponseCache<T>;
  key: string;
  load: () => Promise<T>;
  nowMs?: () => number;
  ttlMs: number;
};

export type ReadThroughResponseCacheResult<T> = {
  status: ResponseCacheStatus;
  value: T;
};

export async function readThroughResponseCache<T>({
  cache,
  key,
  load,
  nowMs = Date.now,
  ttlMs
}: ReadThroughResponseCacheOptions<T>): Promise<ReadThroughResponseCacheResult<T>> {
  const now = nowMs();
  const current = cache.get(key);

  if (current && current.expiresAtMs > now) {
    if (current.promise) {
      return {
        status: "hit",
        value: await current.promise
      };
    }

    if ("value" in current) {
      return {
        status: "hit",
        value: current.value as T
      };
    }
  }

  const promise = Promise.resolve().then(load);
  cache.set(key, {
    expiresAtMs: now + ttlMs,
    promise
  });

  try {
    const value = await promise;
    cache.set(key, {
      expiresAtMs: nowMs() + ttlMs,
      value
    });

    return {
      status: "miss",
      value
    };
  } catch (error) {
    if (cache.get(key)?.promise === promise) {
      cache.delete(key);
    }

    throw error;
  }
}
