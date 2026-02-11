/**
 * Retry utility with exponential backoff
 *
 * Features:
 * - Configurable max retries (default: 3)
 * - Initial delay 1s, max delay 10s
 * - Jitter to prevent thundering herd
 * - Never retries auth errors (code 209)
 */

// Auth error code that should never be retried
const AUTH_ERROR_CODE = 209;

/**
 * Check if an error is an authentication error that should not be retried
 * @param {Error} error - The error to check
 * @returns {boolean} True if this is an auth error
 */
export function isAuthError(error) {
  return error && error.code === AUTH_ERROR_CODE;
}

/**
 * Calculate delay with exponential backoff and jitter
 * @param {number} attempt - Current attempt number (0-indexed)
 * @param {number} initialDelay - Initial delay in ms
 * @param {number} maxDelay - Maximum delay in ms
 * @returns {number} Delay in milliseconds
 */
function calculateDelay(attempt, initialDelay, maxDelay) {
  // Exponential backoff: initialDelay * 2^attempt
  const exponentialDelay = initialDelay * Math.pow(2, attempt);
  // Cap at maxDelay
  const cappedDelay = Math.min(exponentialDelay, maxDelay);
  // Add jitter (0-25% of the delay) to prevent thundering herd
  const jitter = cappedDelay * Math.random() * 0.25;
  return cappedDelay + jitter;
}

/**
 * Sleep for a given number of milliseconds
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Retry an async function with exponential backoff
 *
 * @param {Function} fn - Async function to retry
 * @param {Object} options - Configuration options
 * @param {number} options.maxRetries - Maximum number of retries (default: 3)
 * @param {number} options.initialDelay - Initial delay in ms (default: 1000)
 * @param {number} options.maxDelay - Maximum delay in ms (default: 10000)
 * @param {Function} options.shouldRetry - Custom function to determine if error should be retried
 * @param {Function} options.onRetry - Callback called before each retry with (error, attempt)
 * @returns {Promise<any>} Result of the function
 * @throws {Error} The last error if all retries fail
 */
export async function retryWithBackoff(fn, options = {}) {
  const {
    maxRetries = 3,
    initialDelay = 1000,
    maxDelay = 10000,
    shouldRetry = () => true,
    onRetry = null,
  } = options;

  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Never retry auth errors
      if (isAuthError(error)) {
        throw error;
      }

      // Check if we should retry this error
      if (!shouldRetry(error)) {
        throw error;
      }

      // Check if we've exhausted all retries
      if (attempt >= maxRetries) {
        throw error;
      }

      // Calculate delay and wait
      const delay = calculateDelay(attempt, initialDelay, maxDelay);

      // Call onRetry callback if provided
      if (onRetry) {
        onRetry(error, attempt + 1);
      }

      console.log(`Retry attempt ${attempt + 1}/${maxRetries} after ${Math.round(delay)}ms`);
      await sleep(delay);
    }
  }

  throw lastError;
}

/**
 * Check if an error is a network error that can be retried
 * @param {Error} error - The error to check
 * @returns {boolean} True if this is a retryable network error
 */
export function isNetworkError(error) {
  if (!error) return false;

  // Parse error code 100 is network unreachable
  if (error.code === 100) return true;

  // Check for network-related error messages
  const message = (error.message || '').toLowerCase();
  return message.includes('network') ||
         message.includes('timeout') ||
         message.includes('connection') ||
         message.includes('econnrefused') ||
         message.includes('enotfound');
}

export default {
  retryWithBackoff,
  isAuthError,
  isNetworkError,
};
