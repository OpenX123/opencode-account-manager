export function createAsyncCache<T>(ttlMs: number, load: () => Promise<T>) {
  let entry: { value: T; fetchedAt: number; expiresAt: number } | null = null;
  let pending: Promise<T> | null = null;

  return async (force = false) => {
    const now = Date.now();
    if (!force && entry && entry.expiresAt > now) {
      return { value: entry.value, fetchedAt: entry.fetchedAt, cached: true };
    }

    pending ??= load()
      .then((value) => {
        const fetchedAt = Date.now();
        entry = { value, fetchedAt, expiresAt: fetchedAt + ttlMs };
        return value;
      })
      .finally(() => { pending = null; });

    const value = await pending;
    return { value, fetchedAt: entry!.fetchedAt, cached: false };
  };
}
