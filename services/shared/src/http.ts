const DEFAULT_RETRIES = 3;
const BASE_DELAY_MS = 200;

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const shouldRetry = (status: number): boolean => {
  return status === 429 || status >= 500;
};

export interface HttpGetOptions {
  retries?: number;
  requestInit?: RequestInit;
}

export async function httpGetJson<T>(url: string, options: HttpGetOptions = {}): Promise<T> {
  const retries = options.retries ?? DEFAULT_RETRIES;
  let attempt = 0;
  let lastError: unknown;

  while (attempt <= retries) {
    try {
      const response = await fetch(url, options.requestInit);
      if (!response.ok) {
        if (shouldRetry(response.status) && attempt < retries) {
          throw new Error(`Retryable status ${response.status}`);
        }
        throw new Error(`Request failed with status ${response.status}`);
      }
      return (await response.json()) as T;
    } catch (error) {
      lastError = error;
      if (attempt >= retries) {
        break;
      }
      const jitter = Math.random() * BASE_DELAY_MS;
      const delay = BASE_DELAY_MS * 2 ** attempt + jitter;
      await sleep(delay);
      attempt += 1;
    }
  }

  throw lastError;
}
