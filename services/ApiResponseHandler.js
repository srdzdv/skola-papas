/**
 * ApiResponseHandler - Centralized handling for standardized API responses
 *
 * All cloud functions now return:
 * - Success: { success: true, data: { ... } }
 * - Error: { success: false, error: { code: string, message: string } }
 */

// Error codes from backend
export const ApiErrorCode = {
  INVALID_PARAMS: 'INVALID_PARAMS',
  NOT_FOUND: 'NOT_FOUND',
  ANUNCIO_NOT_FOUND: 'ANUNCIO_NOT_FOUND',
  EVENTO_NOT_FOUND: 'EVENTO_NOT_FOUND',
  UNAUTHORIZED: 'UNAUTHORIZED',
  FILE_TOO_LARGE: 'FILE_TOO_LARGE',
  INVALID_FILE_TYPE: 'INVALID_FILE_TYPE',
  S3_ERROR: 'S3_ERROR',
  NOTIFICATION_FAILED: 'NOTIFICATION_FAILED',
  DELETE_FAILED: 'DELETE_FAILED',
  REMINDER_FAILED: 'REMINDER_FAILED',
  SESSION_EXPIRED: 'SESSION_EXPIRED',
  NETWORK_ERROR: 'NETWORK_ERROR',
};

// Parse error code for invalid session
const INVALID_SESSION_ERROR_CODE = 209;

// User-friendly error messages in Spanish
const ERROR_MESSAGES = {
  [ApiErrorCode.INVALID_PARAMS]: {
    title: 'Datos incompletos',
    message: 'Faltan datos requeridos para completar la operación.',
  },
  [ApiErrorCode.NOT_FOUND]: {
    title: 'No encontrado',
    message: 'No se encontró el recurso solicitado.',
  },
  [ApiErrorCode.ANUNCIO_NOT_FOUND]: {
    title: 'Mensaje no encontrado',
    message: 'El mensaje que buscas ya no existe.',
  },
  [ApiErrorCode.EVENTO_NOT_FOUND]: {
    title: 'Evento no encontrado',
    message: 'El evento que buscas ya no existe.',
  },
  [ApiErrorCode.UNAUTHORIZED]: {
    title: 'Sin permiso',
    message: 'No tienes permiso para realizar esta acción.',
  },
  [ApiErrorCode.FILE_TOO_LARGE]: {
    title: 'Archivo muy grande',
    message: 'El archivo excede el límite permitido. Intenta con uno más pequeño.',
  },
  [ApiErrorCode.INVALID_FILE_TYPE]: {
    title: 'Formato no válido',
    message: 'El formato del archivo no es compatible. Usa JPG, PNG o PDF.',
  },
  [ApiErrorCode.S3_ERROR]: {
    title: 'Error de almacenamiento',
    message: 'Hubo un problema al guardar el archivo. Intenta de nuevo.',
  },
  [ApiErrorCode.NOTIFICATION_FAILED]: {
    title: 'Error de notificación',
    message: 'No se pudo enviar la notificación.',
  },
  [ApiErrorCode.DELETE_FAILED]: {
    title: 'Error al eliminar',
    message: 'No se pudo eliminar. Intenta de nuevo.',
  },
  [ApiErrorCode.REMINDER_FAILED]: {
    title: 'Error de recordatorio',
    message: 'No se pudo programar el recordatorio.',
  },
  [ApiErrorCode.SESSION_EXPIRED]: {
    title: 'Sesion expirada',
    message: 'Tu sesion ha caducado. Por favor, inicia sesion de nuevo.',
  },
  [ApiErrorCode.NETWORK_ERROR]: {
    title: 'Sin conexion',
    message: 'Verifica tu conexion a internet e intenta de nuevo.',
  },
};

// Default error for unknown codes
const DEFAULT_ERROR = {
  title: 'Error inesperado',
  message: 'Ocurrió un problema. Intenta de nuevo.',
};

/**
 * Check if response uses new standardized format
 */
export function isStandardizedResponse(response) {
  return response !== null &&
    typeof response === 'object' &&
    typeof response.success === 'boolean';
}

/**
 * Get user-friendly error message for an error code
 */
export function getErrorMessageForCode(code) {
  return ERROR_MESSAGES[code] || DEFAULT_ERROR;
}

/**
 * Handle API response with backward compatibility
 *
 * @param {any} response - Raw response from cloud function
 * @param {Object} options - Options for handling
 * @param {Function} options.onSuccess - Callback for success
 * @param {Function} options.onError - Callback for error
 * @param {any} options.legacySuccessValue - Value that indicates success in legacy format
 * @returns {Object} Normalized response { success, data, error }
 */
export function handleApiResponse(response, options = {}) {
  const { legacySuccessValue } = options;

  // New standardized format
  if (isStandardizedResponse(response)) {
    if (response.success) {
      return {
        success: true,
        data: response.data || {},
      };
    } else {
      const errorInfo = response.error || {};
      const userMessage = getErrorMessageForCode(errorInfo.code);

      return {
        success: false,
        error: {
          code: errorInfo.code || 'UNKNOWN',
          message: errorInfo.message || userMessage.message,
          title: userMessage.title,
        },
      };
    }
  }

  // Legacy format - treat as success if we got a response
  // Check for specific legacy success values
  if (legacySuccessValue !== undefined) {
    if (response === legacySuccessValue ||
        (typeof response === 'string' && response.includes(legacySuccessValue))) {
      return {
        success: true,
        data: { legacyResponse: response },
      };
    }
  }

  // Legacy format - string responses were typically success
  if (typeof response === 'string') {
    return {
      success: true,
      data: { legacyResponse: response },
    };
  }

  // Legacy format - object without success field
  if (response && typeof response === 'object') {
    return {
      success: true,
      data: response,
    };
  }

  // Undefined or null - treat as success (some old functions returned nothing)
  if (response === undefined || response === null) {
    return {
      success: true,
      data: {},
    };
  }

  return {
    success: false,
    error: DEFAULT_ERROR,
  };
}

/**
 * Wrapper for Parse Cloud function calls with standardized handling
 *
 * @param {string} functionName - Cloud function name
 * @param {Object} params - Function parameters
 * @param {Object} options - Additional options
 * @returns {Promise<{success: boolean, data?: Object, error?: Object}>}
 */
/**
 * Check if an error is a session expired error (Parse error 209)
 * @param {Error} error - The error to check
 * @returns {boolean} True if this is a session expired error
 */
export function isSessionExpiredError(error) {
  return error && error.code === INVALID_SESSION_ERROR_CODE;
}

export async function callCloudFunction(functionName, params, options = {}) {
  const Parse = require('parse/react-native');
  const { handleSessionExpired = null } = options;

  try {
    const response = await Parse.Cloud.run(functionName, params);
    return handleApiResponse(response, options);
  } catch (error) {
    // Network or Parse errors
    console.error(`Cloud function ${functionName} error:`, error);

    // Check if it's a session expired error (code 209)
    if (isSessionExpiredError(error)) {
      // Import AuthErrorInterceptor dynamically to avoid circular dependency
      const { handleAuthError } = require('./AuthErrorInterceptor');
      handleAuthError(error, { source: `cloudFunction:${functionName}` });

      return {
        success: false,
        isAuthError: true,
        error: {
          code: ApiErrorCode.SESSION_EXPIRED,
          title: ERROR_MESSAGES[ApiErrorCode.SESSION_EXPIRED].title,
          message: ERROR_MESSAGES[ApiErrorCode.SESSION_EXPIRED].message,
        },
      };
    }

    // Check if it's a network error
    if (error.code === 100 || error.message?.includes('network')) {
      return {
        success: false,
        error: {
          code: ApiErrorCode.NETWORK_ERROR,
          title: ERROR_MESSAGES[ApiErrorCode.NETWORK_ERROR].title,
          message: ERROR_MESSAGES[ApiErrorCode.NETWORK_ERROR].message,
        },
      };
    }

    // Parse error with code
    if (error.code) {
      return {
        success: false,
        error: {
          code: `PARSE_ERROR_${error.code}`,
          title: 'Error de servidor',
          message: error.message || 'Ocurrio un error en el servidor.',
        },
      };
    }

    return {
      success: false,
      error: {
        code: 'UNKNOWN',
        ...DEFAULT_ERROR,
      },
    };
  }
}

export default {
  ApiErrorCode,
  isStandardizedResponse,
  getErrorMessageForCode,
  handleApiResponse,
  callCloudFunction,
  isSessionExpiredError,
};
