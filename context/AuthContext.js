/**
 * AuthContext - Central authentication state management
 *
 * Provides:
 * - Centralized auth state (user, isAuthenticated, etc.)
 * - Session validation on app launch and foreground
 * - Global auth error handling
 * - Sign in/out methods
 *
 * Usage:
 * - Wrap app with <AuthProvider>
 * - Use useAuth() hook in functional components
 * - Use static contextType = AuthContext in class components
 */

import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';
import { AppState, Alert } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ParseInit from '../ParseInit.js';
import * as RootNavigation from '../navigation/RootNavigation';
import {
  setAuthErrorCallback,
  clearAuthErrorCallback,
  resetErrorHandlingState
} from '../services/AuthErrorInterceptor';

var Parse = require('parse/react-native');

// Session validation interval (5 minutes)
const SESSION_VALIDATION_INTERVAL = 5 * 60 * 1000;

// Keys to remove on logout
const KEYS_TO_REMOVE = [
  'userEstudianteIDs',
  'qrCodeStringAS',
  'paqueteAlumnoAS',
  'nombreAlumnoAS',
  'parentescoPersonaAutorizadaAS',
  'nombrePersonaAutorizadaAS',
  'userPhotURLAS',
  'userPlantel'
];

// Default context value
const defaultContextValue = {
  user: null,
  isAuthenticated: false,
  isLoading: true,
  isInitialized: false,
  sessionStatus: 'unknown', // 'valid', 'invalid', 'network_error', 'unknown'
  lastValidated: null,
  signIn: async () => {},
  signOut: async () => {},
  validateSession: async () => {},
  handleAuthError: () => {},
  bootstrap: async () => {},
};

// Create context
export const AuthContext = createContext(defaultContextValue);

/**
 * Custom hook to access auth context
 * @returns {Object} Auth context value
 */
export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

/**
 * AuthProvider component
 * Wraps the app and provides auth state
 */
export function AuthProvider({ children }) {
  // State
  const [user, setUser] = useState(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isInitialized, setIsInitialized] = useState(false);
  const [sessionStatus, setSessionStatus] = useState('unknown');
  const [lastValidated, setLastValidated] = useState(null);

  // Refs
  const appStateRef = useRef(AppState.currentState);
  const validationIntervalRef = useRef(null);
  const isValidatingRef = useRef(false);

  /**
   * Show session expired alert and navigate to login
   */
  const showSessionExpiredAlert = useCallback(() => {
    Alert.alert(
      'Sesion expirada',
      'Tu sesion ha caducado por seguridad. Por favor, inicia sesion de nuevo.',
      [
        {
          text: 'Ok',
          style: 'default',
          onPress: () => {
            performSignOut();
          },
        },
      ],
      { cancelable: false }
    );
  }, []);

  /**
   * Show network error alert
   */
  const showNetworkErrorAlert = useCallback(() => {
    Alert.alert(
      'Error de conexion',
      'No pudimos verificar tu sesion. Verifica tu conexion a internet.',
      [{ text: 'Ok', style: 'default' }],
      { cancelable: false }
    );
  }, []);

  /**
   * Handle auth error from anywhere in the app
   */
  const handleAuthError = useCallback((error, options = {}) => {
    console.log('[AuthContext] handleAuthError called:', error?.code, options);
    showSessionExpiredAlert();
  }, [showSessionExpiredAlert]);

  /**
   * Perform the actual sign out logic
   */
  const performSignOut = useCallback(async () => {
    try {
      // Reset error handling state
      resetErrorHandlingState();

      // Remove Expo Push token if exists
      const expoPushToken = await AsyncStorage.getItem('expoPushToken');
      if (expoPushToken !== null) {
        await AsyncStorage.removeItem('expoPushToken');
      }

      // Remove all stored keys
      await AsyncStorage.multiRemove(KEYS_TO_REMOVE);
      console.log('[AuthContext] All AS Keys Removed.');

      // Parse log out
      await Parse.User.logOut();
      console.log('[AuthContext] User logged out from Parse.');
    } catch (error) {
      console.log('[AuthContext] Error during sign out:', error);
    } finally {
      // Update state
      setUser(null);
      setIsAuthenticated(false);
      setSessionStatus('invalid');

      // Navigate to auth screen
      RootNavigation.navigate('RootAuth');
    }
  }, []);

  /**
   * Sign out the current user
   */
  const signOut = useCallback(async () => {
    await performSignOut();
  }, [performSignOut]);

  /**
   * Validate the current session
   * @returns {Promise<boolean>} True if session is valid
   */
  const validateSession = useCallback(async () => {
    // Prevent concurrent validations
    if (isValidatingRef.current) {
      console.log('[AuthContext] Already validating, skipping');
      return sessionStatus === 'valid';
    }

    isValidatingRef.current = true;

    try {
      const currentUser = await Parse.User.currentAsync();

      if (!currentUser) {
        console.log('[AuthContext] No current user');
        setSessionStatus('invalid');
        return false;
      }

      // Try to fetch user to validate session
      await currentUser.fetch();

      console.log('[AuthContext] Session validated successfully');
      setUser(currentUser);
      setSessionStatus('valid');
      setLastValidated(new Date());
      return true;
    } catch (error) {
      console.log('[AuthContext] Session validation error:', error?.code, error?.message);

      // Check if it's an auth error (code 209)
      if (error?.code === 209) {
        setSessionStatus('invalid');
        return false;
      }

      // Network error - assume valid for now
      if (error?.code === 100 || error?.message?.includes('network')) {
        console.log('[AuthContext] Network error during validation, assuming valid');
        setSessionStatus('network_error');
        return true; // Don't log out on network errors
      }

      // Unknown error - assume valid
      setSessionStatus('unknown');
      return true;
    } finally {
      isValidatingRef.current = false;
    }
  }, [sessionStatus]);

  /**
   * Sign in with username and password
   * @param {string} username
   * @param {string} password
   * @returns {Promise<Object>} Result with success flag and user or error
   */
  const signIn = useCallback(async (username, password) => {
    try {
      const loggedInUser = await Parse.User.logIn(username, password);

      const status = loggedInUser.get('status');
      if (status !== 0) {
        // User is blocked
        await Parse.User.logOut();
        return {
          success: false,
          error: {
            code: 'USER_BLOCKED',
            message: 'Usuario no tiene permiso para acceder a la aplicacion.',
          },
        };
      }

      const usertype = loggedInUser.get('usertype');
      if (usertype !== 2) {
        // Not a parent user
        await Parse.User.logOut();
        return {
          success: false,
          error: {
            code: 'INVALID_USER_TYPE',
            message: 'Solo Mama o Papa pueden ingresar.',
          },
        };
      }

      // Success
      console.log('[AuthContext] Sign in successful');
      setUser(loggedInUser);
      setIsAuthenticated(true);
      setSessionStatus('valid');
      setLastValidated(new Date());

      return {
        success: true,
        user: loggedInUser,
      };
    } catch (error) {
      console.log('[AuthContext] Sign in error:', error?.code, error?.message);
      return {
        success: false,
        error: {
          code: error?.code || 'UNKNOWN',
          message: error?.message || 'Error desconocido',
        },
      };
    }
  }, []);

  /**
   * Bootstrap the auth state
   * Called on app launch
   * @returns {Promise<Object>} Result with authenticated flag
   */
  const bootstrap = useCallback(async () => {
    console.log('[AuthContext] Bootstrap starting...');
    setIsLoading(true);

    try {
      // Get stored plantel
      const userPlantel = await AsyncStorage.getItem('userPlantel');

      if (!userPlantel) {
        console.log('[AuthContext] No plantel setup');
        setIsLoading(false);
        setIsInitialized(true);
        setIsAuthenticated(false);
        return { authenticated: false };
      }

      // Initialize Parse SDK
      const parseInit = new ParseInit();
      parseInit.initParseSDKForPlantel(userPlantel);

      // Get cached user
      const currentUser = await Parse.User.currentAsync();

      if (!currentUser) {
        console.log('[AuthContext] No cached user');
        setIsLoading(false);
        setIsInitialized(true);
        setIsAuthenticated(false);
        return { authenticated: false };
      }

      // Validate session
      try {
        const fetchedUser = await currentUser.fetch();

        if (!fetchedUser) {
          console.log('[AuthContext] User fetch returned null');
          setIsLoading(false);
          setIsInitialized(true);
          setIsAuthenticated(false);
          return { authenticated: false };
        }

        const status = fetchedUser.get('status');
        if (status !== 0) {
          console.log('[AuthContext] User status not zero');
          setIsLoading(false);
          setIsInitialized(true);
          setIsAuthenticated(false);
          return { authenticated: false };
        }

        // Success - user is authenticated
        console.log('[AuthContext] Bootstrap successful, user authenticated');
        setUser(fetchedUser);
        setIsAuthenticated(true);
        setSessionStatus('valid');
        setLastValidated(new Date());
        setIsLoading(false);
        setIsInitialized(true);
        return { authenticated: true };
      } catch (error) {
        console.log('[AuthContext] Bootstrap validation error:', error?.code, error?.message);

        // Check if it's an auth error (code 209)
        if (error?.code === 209) {
          setSessionStatus('invalid');
          setIsLoading(false);
          setIsInitialized(true);

          // Show alert and sign out
          showSessionExpiredAlert();
          return { authenticated: false };
        }

        // Network error - show alert but don't log out
        if (error?.code === 100 || error?.message?.includes('network')) {
          console.log('[AuthContext] Network error during bootstrap');
          setSessionStatus('network_error');
          showNetworkErrorAlert();
          setIsLoading(false);
          setIsInitialized(true);
          setIsAuthenticated(false);
          return { authenticated: false, networkError: true };
        }

        // Unknown error
        setIsLoading(false);
        setIsInitialized(true);
        setIsAuthenticated(false);
        return { authenticated: false };
      }
    } catch (error) {
      console.log('[AuthContext] Bootstrap error:', error);
      setIsLoading(false);
      setIsInitialized(true);
      setIsAuthenticated(false);
      return { authenticated: false };
    }
  }, [showSessionExpiredAlert, showNetworkErrorAlert]);

  /**
   * Handle app state changes (foreground/background)
   */
  const handleAppStateChange = useCallback((nextAppState) => {
    if (
      appStateRef.current.match(/inactive|background/) &&
      nextAppState === 'active'
    ) {
      console.log('[AuthContext] App came to foreground, validating session');

      // Only validate if authenticated
      if (isAuthenticated) {
        validateSession().then((isValid) => {
          if (!isValid && sessionStatus === 'invalid') {
            showSessionExpiredAlert();
          }
        });
      }
    }

    appStateRef.current = nextAppState;
  }, [isAuthenticated, sessionStatus, validateSession, showSessionExpiredAlert]);

  // Set up auth error callback
  useEffect(() => {
    setAuthErrorCallback(handleAuthError);

    return () => {
      clearAuthErrorCallback();
    };
  }, [handleAuthError]);

  // Set up app state listener
  useEffect(() => {
    const subscription = AppState.addEventListener('change', handleAppStateChange);

    return () => {
      subscription?.remove();
    };
  }, [handleAppStateChange]);

  // Set up periodic session validation
  useEffect(() => {
    if (isAuthenticated) {
      validationIntervalRef.current = setInterval(() => {
        console.log('[AuthContext] Periodic session validation');
        validateSession().then((isValid) => {
          if (!isValid && sessionStatus === 'invalid') {
            showSessionExpiredAlert();
          }
        });
      }, SESSION_VALIDATION_INTERVAL);
    }

    return () => {
      if (validationIntervalRef.current) {
        clearInterval(validationIntervalRef.current);
        validationIntervalRef.current = null;
      }
    };
  }, [isAuthenticated, sessionStatus, validateSession, showSessionExpiredAlert]);

  // Context value
  const contextValue = {
    user,
    isAuthenticated,
    isLoading,
    isInitialized,
    sessionStatus,
    lastValidated,
    signIn,
    signOut,
    validateSession,
    handleAuthError,
    bootstrap,
  };

  return (
    <AuthContext.Provider value={contextValue}>
      {children}
    </AuthContext.Provider>
  );
}

export default AuthContext;
