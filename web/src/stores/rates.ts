import { defineStore } from 'pinia';

type CacheEntry<T> = {
  value: T;
  expiresAt: number;
};

const CACHE_TTL_MS = 5 * 60 * 1000;

export const useRatesStore = defineStore('rates', {
  state: () => ({
    latest: new Map<string, CacheEntry<{ rate: number; asOf: string }>>(),
    history: new Map<string, CacheEntry<Array<{ date: string; value: number }>>>()
  }),
  actions: {
    setLatest(key: string, value: { rate: number; asOf: string }) {
      this.latest.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    },
    getLatest(key: string) {
      const entry = this.latest.get(key);
      if (entry && entry.expiresAt > Date.now()) {
        return entry.value;
      }
      if (entry) {
        this.latest.delete(key);
      }
      return undefined;
    },
    setHistory(key: string, value: Array<{ date: string; value: number }>) {
      this.history.set(key, { value, expiresAt: Date.now() + CACHE_TTL_MS });
    },
    getHistory(key: string) {
      const entry = this.history.get(key);
      if (entry && entry.expiresAt > Date.now()) {
        return entry.value;
      }
      if (entry) {
        this.history.delete(key);
      }
      return undefined;
    }
  }
});
