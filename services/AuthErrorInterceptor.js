/**
 * AuthErrorInterceptor - Singleton for global auth error handling
 *
 * This module provides a centralized way to handle authentication errors
 * across the app. It prevents multiple simultaneous alerts and ensures
 * consistent handling of session expiration.
 */

import { trackEvent } from "@aptabase/react-native";
import Parse from 'parse/react-native';

// Parse error code for invalid session token
const INVALID_SESSION_ERROR_CODE = 209;

// Singleton state
let authErrorCallback = null;
let isHandlingError = false;

/**
 * Set the callback to be called when an auth error is detected
 * This should be called by AuthContext on mount
 *
 * @param {Function} callback - Function to call on auth error
 */
export function setAuthErrorCallback(callback) {
  authErrorCallback = callback;
}

/**
 * Clear the auth error callback
 * This should be called by AuthContext on unmount
 */
export function clearAuthErrorCallback() {
  authErrorCallback = null;
}

/**
 * Check if an error is an authentication error (code 209)
 *
 * @param {Error|Object} error - The error to check
 * @returns {boolean} True if this is an auth error
 */
export function isAuthError(error) {
  if (!error) return false;

  // Direct error code check
  if (error.code === INVALID_SESSION_ERROR_CODE) {
    return true;
  }

  // Check for nested error object (from standardized API responses)
  if (error.error && error.error.code === `PARSE_ERROR_${INVALID_SESSION_ERROR_CODE}`) {
    return true;
  }

  // Check error message for session-related keywords
  const message = (error.message || '').toLowerCase();
  return message.includes('invalid session') ||
         message.includes('session token') ||
         message.includes('session expired');
}

/**
 * Handle an authentication error
 * This will trigger the auth error callback if set and not already handling
 *
 * @param {Error|Object} error - The error that occurred
 * @param {Object} options - Additional options
 * @param {string} options.source - Where the error originated from
 * @returns {boolean} True if the error was handled
 */
export function handleAuthError(error, options = {}) {
  const { source = 'unknown' } = options;

  // Don't handle if not an auth error
  if (!isAuthError(error)) {
    return false;
  }

  // Prevent multiple simultaneous error handling
  if (isHandlingError) {
    console.log('[AuthErrorInterceptor] Already handling auth error, skipping');
    return true;
  }

  // Check if callback is set
  if (!authErrorCallback) {
    console.warn('[AuthErrorInterceptor] No auth error callback set');
    return false;
  }

  console.log(`[AuthErrorInterceptor] Handling auth error from: ${source}`);

  // Track session expiration analytics
  try {
    const currentUser = Parse.User.current();
    const escuela = currentUser?.get('escuela');
    trackEvent('session_expired', {
      source,
      userId: currentUser?.id || 'unknown',
      escuelaId: escuela?.id || 'unknown',
    });
  } catch (analyticsError) {
    console.warn('[AuthErrorInterceptor] Failed to track analytics:', analyticsError);
  }

  // Set flag to prevent multiple alerts
  isHandlingError = true;

  try {
    authErrorCallback(error, { source });
  } finally {
    // Reset flag after a short delay to allow for navigation
    setTimeout(() => {
      isHandlingError = false;
    }, 1000);
  }

  return true;
}

/**
 * Reset the error handling state
 * Useful for testing or when navigating to login screen
 */
export function resetErrorHandlingState() {
  isHandlingError = false;
}

/**
 * Get the current error handling state
 * Useful for testing
 *
 * @returns {Object} Current state
 */
export function getState() {
  return {
    hasCallback: authErrorCallback !== null,
    isHandlingError,
  };
}

export default {
  setAuthErrorCallback,
  clearAuthErrorCallback,
  isAuthError,
  handleAuthError,
  resetErrorHandlingState,
  getState,
};
