import axios from 'axios';

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes
const MAX_RETRIES = 3;
const CACHEABLE_PATHS = ['/satisfaction', '/stats', '/ticket-fields'];

export class GorgiasClient {
  constructor({ domain, username, apiKey }) {
    if (!domain || !username || !apiKey) {
      throw new Error(
        'Missing required config. Set GORGIAS_DOMAIN, GORGIAS_USERNAME, and GORGIAS_API_KEY.'
      );
    }

    // Normalize domain to base URL
    const baseURL = domain.startsWith('https://')
      ? domain.replace(/\/+$/, '')
      : `https://${domain}`;

    this.api = axios.create({
      baseURL: `${baseURL}/api`,
      headers: {
        'Content-Type': 'application/json',
      },
      auth: {
        username,
        password: apiKey,
      },
    });

    this.cache = new Map();
  }

  /**
   * Check if a path should be cached.
   */
  isCacheable(path) {
    return CACHEABLE_PATHS.some((p) => path.startsWith(p));
  }

  /**
   * Get a cache key from method + path + params.
   */
  cacheKey(path, params) {
    return `${path}?${JSON.stringify(params || {})}`;
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
   * Core request method with retry on 429 and optional caching.
   */
  async request(method, path, params, data) {
    // Check cache for GET requests on cacheable paths
    if (method === 'GET' && this.isCacheable(path)) {
      const key = this.cacheKey(path, params);
      const cached = this.getCached(key);
      if (cached !== undefined) return cached;
    }

    let lastError;
    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        const response = await this.api.request({
          method,
          url: path,
          params: method === 'GET' ? params : undefined,
          data: method !== 'GET' ? data : undefined,
        });

        const result = response.data;

        // Cache if applicable
        if (method === 'GET' && this.isCacheable(path)) {
          const key = this.cacheKey(path, params);
          this.cache.set(key, { data: result, ts: Date.now() });
        }

        return result;
      } catch (error) {
        lastError = error;

        // Only retry on 429 (rate limit)
        if (error.response?.status === 429 && attempt < MAX_RETRIES) {
          const retryAfter = parseInt(error.response.headers['retry-after'], 10);
          const waitMs = retryAfter ? retryAfter * 1000 : Math.pow(2, attempt) * 1000;
          await this.sleep(waitMs);
          continue;
        }

        // Format error message
        if (error.response) {
          const { status, data: body } = error.response;
          if (status === 401 || status === 403) {
            throw new Error(
              `Authentication failed (${status}). Check GORGIAS_DOMAIN, GORGIAS_USERNAME, and GORGIAS_API_KEY.`
            );
          }
          throw new Error(
            `Gorgias API error ${status}: ${typeof body === 'string' ? body : JSON.stringify(body)}`
          );
        }
        throw new Error(`Gorgias request failed: ${error.message}`);
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
