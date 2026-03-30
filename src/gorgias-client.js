const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_RETRIES = 3;
const CACHEABLE_PATHS = ['/stats/', '/custom-fields'];

export class GorgiasClient {
  constructor({ domain, username, apiKey }) {
    if (!domain || !username || !apiKey) {
      throw new Error(
        'Missing required config. Set GORGIAS_DOMAIN, GORGIAS_USERNAME, and GORGIAS_API_KEY.'
      );
    }

    // Normalize domain to base URL
    const base = domain.startsWith('https://')
      ? domain.replace(/\/+$/, '')
      : `https://${domain}`;

    this.baseURL = `${base}/api`;
    this.authHeader = `Basic ${btoa(`${username}:${apiKey}`)}`;
    this.cache = new Map();
  }

  /**
   * Check if a path should be cached.
   */
  isCacheable(path) {
    return CACHEABLE_PATHS.some((p) => path.startsWith(p));
  }

  /**
   * Get a cache key from path + params/data.
   */
  cacheKey(path, params, data) {
    return `${path}?${JSON.stringify(params || {})}:${JSON.stringify(data || {})}`;
  }

  /**
   * Look up a cached response. Returns undefined if miss or expired.
   */
  getCached(key) {
    const entry = this.cache.get(key);
    if (!entry) return undefined;
    if (Date.now() - entry.ts > CACHE_TTL_MS) {
      this.cache.delete(key);
      return undefined;
    }
    return entry.data;
  }

  /**
   * Clear all cached data.
   */
  clearCache() {
    this.cache.clear();
  }

  /**
   * Sleep helper for backoff.
   */
  sleep(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Build a full URL with query params for GET requests.
   */
  buildURL(path, params) {
    const url = new URL(`${this.baseURL}${path}`);
    if (params) {
      for (const [key, value] of Object.entries(params)) {
        if (value !== undefined && value !== null) {
          url.searchParams.set(key, String(value));
        }
      }
    }
    return url.toString();
  }

  /**
   * Core request method with retry on 429 and optional caching.
   */
  async request(method, path, params, data) {
    // Check cache for cacheable paths
    if (this.isCacheable(path)) {
      const key = this.cacheKey(path, params, data);
      const cached = this.getCached(key);
      if (cached !== undefined) return cached;
    }

    let lastError;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const url = method === 'GET' ? this.buildURL(path, params) : this.buildURL(path);
        const options = {
          method,
          headers: {
            'Authorization': this.authHeader,
            'Content-Type': 'application/json',
          },
        };

        if (method !== 'GET' && data !== undefined) {
          options.body = JSON.stringify(data);
        }

        const response = await fetch(url, options);

        // Handle rate limiting
        if (response.status === 429 && attempt < MAX_RETRIES) {
          const retryAfter = parseInt(response.headers.get('retry-after'), 10);
          const waitMs = retryAfter ? retryAfter * 1000 : Math.pow(2, attempt) * 1000;
          await this.sleep(waitMs);
          continue;
        }

        // Handle errors (fetch doesn't throw on non-2xx)
        if (!response.ok) {
          const body = await response.text();
          if (response.status === 401 || response.status === 403) {
            throw new Error(
              `Authentication failed (${response.status}). Check GORGIAS_DOMAIN, GORGIAS_USERNAME, and GORGIAS_API_KEY.`
            );
          }
          throw new Error(`Gorgias API error ${response.status}: ${body}`);
        }

        const result = await response.json();

        // Cache if applicable
        if (this.isCacheable(path)) {
          const key = this.cacheKey(path, params, data);
          this.cache.set(key, { data: result, ts: Date.now() });
        }

        return result;
      } catch (error) {
        lastError = error;

        // Only retry on 429 (already handled above via continue)
        // For all other errors, throw immediately
        if (!error.message?.includes('429')) {
          throw error;
        }
      }
    }

    throw lastError;
  }

  async get(path, params) {
    return this.request('GET', path, params);
  }

  async post(path, data) {
    return this.request('POST', path, undefined, data);
  }

  async put(path, data) {
    return this.request('PUT', path, undefined, data);
  }
}
