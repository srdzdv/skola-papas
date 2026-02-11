/**
 * ImageUploadService - Centralized image upload handling with proper error management
 *
 * Updated to handle new standardized API response format:
 * - Success: { success: true, data: { ... } }
 * - Error: { success: false, error: { code, message } }
 *
 * Features:
 * - Upload state tracking to prevent duplicates
 * - Retry mechanism with idempotency
 * - User-friendly error messages in Spanish
 * - Proper async/await flow
 */

const Parse = require('parse/react-native');
import * as ImageManipulator from 'expo-image-manipulator';
import {
  callCloudFunction,
  getErrorMessageForCode,
  ApiErrorCode,
} from './ApiResponseHandler';

const RESIZED_PREFIX = "resized-";

// Upload states
export const UploadState = {
  IDLE: 'idle',
  PREPARING: 'preparing',
  UPLOADING: 'uploading',
  RESIZING: 'resizing',
  SUCCESS: 'success',
  ERROR: 'error',
};

// Re-export error codes for convenience
export { ApiErrorCode };

// Additional upload-specific error types
export const UploadErrorType = {
  NETWORK: 'NETWORK_ERROR',
  PERMISSION: 'PERMISSION_ERROR',
  FILE_TOO_LARGE: ApiErrorCode.FILE_TOO_LARGE,
  INVALID_FORMAT: ApiErrorCode.INVALID_FILE_TYPE,
  SERVER: ApiErrorCode.S3_ERROR,
  TIMEOUT: 'TIMEOUT',
  UNKNOWN: 'UNKNOWN',
};

// User-friendly error messages in Spanish (for upload-specific errors)
const UPLOAD_ERROR_MESSAGES = {
  [UploadErrorType.NETWORK]: {
    title: 'Sin conexión',
    message: 'No hay conexión a internet. Verifica tu conexión e intenta de nuevo.',
  },
  [UploadErrorType.PERMISSION]: {
    title: 'Permiso denegado',
    message: 'La app no tiene permiso para acceder a tus fotos. Por favor habilita el permiso en Configuración.',
  },
  [UploadErrorType.TIMEOUT]: {
    title: 'Tiempo agotado',
    message: 'La subida tardó demasiado. Verifica tu conexión e intenta de nuevo.',
  },
  [UploadErrorType.UNKNOWN]: {
    title: 'Error inesperado',
    message: 'Ocurrió un problema al subir la imagen. Intenta de nuevo.',
  },
};

/**
 * Get user-friendly error message
 * Combines API error codes with upload-specific errors
 */
export function getErrorMessage(error) {
  // If error has a code, try to get message for that code
  if (error?.code) {
    // Check upload-specific messages first
    if (UPLOAD_ERROR_MESSAGES[error.code]) {
      return UPLOAD_ERROR_MESSAGES[error.code];
    }
    // Then check API error codes
    return getErrorMessageForCode(error.code);
  }

  // If error is already formatted with title/message
  if (error?.title && error?.message) {
    return { title: error.title, message: error.message };
  }

  // Categorize error from message
  const errorMessage = error?.message?.toLowerCase() || '';

  if (errorMessage.includes('network') || errorMessage.includes('fetch') || errorMessage.includes('connection')) {
    return UPLOAD_ERROR_MESSAGES[UploadErrorType.NETWORK];
  }

  if (errorMessage.includes('permission') || errorMessage.includes('access denied')) {
    return UPLOAD_ERROR_MESSAGES[UploadErrorType.PERMISSION];
  }

  if (errorMessage.includes('too large') || errorMessage.includes('size limit')) {
    return getErrorMessageForCode(ApiErrorCode.FILE_TOO_LARGE);
  }

  if (errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
    return UPLOAD_ERROR_MESSAGES[UploadErrorType.TIMEOUT];
  }

  return UPLOAD_ERROR_MESSAGES[UploadErrorType.UNKNOWN];
}

/**
 * Convert image URI to base64
 */
async function imageToBase64(imageURI) {
  const response = await fetch(imageURI);

  if (!response.ok) {
    throw new Error('Failed to fetch image file');
  }

  const blob = await response.blob();

  // Check file size (max 10MB)
  if (blob.size > 10 * 1024 * 1024) {
    const error = new Error('El archivo excede el límite de 10MB');
    error.code = ApiErrorCode.FILE_TOO_LARGE;
    throw error;
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onloadend = () => {
      resolve(reader.result);
    };

    reader.onerror = () => {
      reject(new Error('Failed to read image file'));
    };

    reader.readAsDataURL(blob);
  });
}

/**
 * Resize image for thumbnail
 */
async function createThumbnail(imageURI) {
  const resizedImage = await ImageManipulator.manipulateAsync(
    imageURI,
    [{ resize: { width: 200 } }],
    { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
  );
  return resizedImage.uri;
}

/**
 * Upload image to AWS S3 via Parse Cloud
 * Handles new standardized response format
 *
 * @returns {Promise<{objectKey: string, size?: number, uploadedAt?: string}>}
 */
async function uploadToS3(objectKey, base64Data, contentType) {
  const payload = {
    objectKey: objectKey,
    imageBase64: base64Data,
    contentType: contentType,
  };

  const result = await callCloudFunction("uploadAWSS3Object", payload);

  if (result.success) {
    // New format returns detailed data
    if (result.data.objectKey) {
      return {
        objectKey: result.data.objectKey,
        size: result.data.size,
        contentType: result.data.contentType,
        uploadedAt: result.data.uploadedAt,
      };
    }
    // Legacy format
    return { objectKey, success: true };
  }

  // Throw with error details for proper handling
  const error = new Error(result.error.message);
  error.code = result.error.code;
  error.title = result.error.title;
  throw error;
}

/**
 * ImageUploadManager - Manages the upload lifecycle
 */
class ImageUploadManager {
  constructor() {
    this.currentUpload = null;
    this.uploadState = UploadState.IDLE;
    this.listeners = new Set();
  }

  /**
   * Add a state change listener
   */
  addListener(callback) {
    this.listeners.add(callback);
    return () => this.listeners.delete(callback);
  }

  /**
   * Notify listeners of state change
   */
  notifyStateChange(state, data = {}) {
    this.uploadState = state;
    this.listeners.forEach(listener => {
      listener({ state, ...data });
    });
  }

  /**
   * Check if an upload is in progress
   */
  isUploading() {
    return [
      UploadState.PREPARING,
      UploadState.UPLOADING,
      UploadState.RESIZING,
    ].includes(this.uploadState);
  }

  /**
   * Reset upload state
   */
  reset() {
    this.currentUpload = null;
    this.uploadState = UploadState.IDLE;
    this.notifyStateChange(UploadState.IDLE);
  }

  /**
   * Create AnuncioPhoto record in Parse
   * Returns existing record if retry
   */
  async getOrCreateAnuncioPhoto(anuncioObject, existingPhotoId = null) {
    // If we have an existing photo ID (retry scenario), return it
    if (existingPhotoId) {
      const AnuncioPhoto = Parse.Object.extend("AnuncioPhoto");
      const query = new Parse.Query(AnuncioPhoto);
      try {
        const existingPhoto = await query.get(existingPhotoId);
        return existingPhoto;
      } catch (error) {
        // If not found, create new one
        console.log("Existing photo not found, creating new one");
      }
    }

    // Create new AnuncioPhoto record
    const AnuncioPhoto = Parse.Object.extend("AnuncioPhoto");
    const anuncioPhoto = new AnuncioPhoto();

    anuncioPhoto.set("anuncio", anuncioObject);
    anuncioPhoto.set("aws", true);
    anuncioPhoto.set("TipoArchivo", "JPG");
    anuncioPhoto.set("newS3Bucket", true);

    const savedPhoto = await anuncioPhoto.save();
    return savedPhoto;
  }

  /**
   * Upload image with full lifecycle management
   *
   * @param {string} imageURI - Local URI of the image
   * @param {Object} anuncioObject - Parse Anuncio object
   * @param {Object} options - Upload options
   * @param {string} options.existingPhotoId - ID of existing AnuncioPhoto for retry
   * @param {boolean} options.createThumbnail - Whether to create thumbnail
   * @param {Function} options.onProgress - Progress callback
   * @returns {Promise<{success: boolean, photoId: string, data?: Object, error?: Object}>}
   */
  async uploadImage(imageURI, anuncioObject, options = {}) {
    const {
      existingPhotoId = null,
      createThumbnail: shouldCreateThumbnail = true,
      onProgress = () => {},
    } = options;

    // Prevent duplicate uploads
    if (this.isUploading()) {
      return {
        success: false,
        error: {
          code: 'UPLOAD_IN_PROGRESS',
          title: 'Subida en progreso',
          message: 'Ya hay una imagen subiéndose. Espera a que termine.',
        },
      };
    }

    try {
      // Step 1: Preparing
      this.notifyStateChange(UploadState.PREPARING);
      onProgress({ step: 'preparing', percent: 10 });

      // Get or create AnuncioPhoto record (idempotent for retries)
      const anuncioPhoto = await this.getOrCreateAnuncioPhoto(
        anuncioObject,
        existingPhotoId
      );
      const photoId = anuncioPhoto.id;

      // Store current upload info for potential retry
      this.currentUpload = {
        imageURI,
        anuncioObject,
        photoId,
      };

      // Step 2: Convert image to base64
      onProgress({ step: 'converting', percent: 20 });
      const base64Data = await imageToBase64(imageURI);

      // Step 3: Upload main image
      this.notifyStateChange(UploadState.UPLOADING);
      onProgress({ step: 'uploading', percent: 40 });

      const uploadResult = await uploadToS3(photoId, base64Data, 'image/jpeg');
      onProgress({ step: 'uploading', percent: 70 });

      // Step 4: Create and upload thumbnail
      if (shouldCreateThumbnail) {
        this.notifyStateChange(UploadState.RESIZING);
        onProgress({ step: 'resizing', percent: 80 });

        try {
          const thumbnailURI = await createThumbnail(imageURI);
          const thumbnailBase64 = await imageToBase64(thumbnailURI);
          const thumbnailKey = RESIZED_PREFIX + photoId;

          await uploadToS3(thumbnailKey, thumbnailBase64, 'image/jpeg');
        } catch (thumbnailError) {
          // Thumbnail failure is not critical, log and continue
          console.warn("Thumbnail creation failed:", thumbnailError);
        }
      }

      // Step 5: Success
      onProgress({ step: 'complete', percent: 100 });
      this.notifyStateChange(UploadState.SUCCESS, { photoId });
      this.currentUpload = null;

      return {
        success: true,
        photoId,
        data: {
          photoId,
          objectKey: uploadResult.objectKey,
          size: uploadResult.size,
          uploadedAt: uploadResult.uploadedAt,
        },
      };

    } catch (error) {
      console.error("Image upload error:", error);

      // Get user-friendly error message
      const errorInfo = error.title && error.message
        ? { title: error.title, message: error.message, code: error.code }
        : { ...getErrorMessage(error), code: error.code || 'UNKNOWN' };

      this.notifyStateChange(UploadState.ERROR, {
        error: errorInfo,
        canRetry: true,
        photoId: this.currentUpload?.photoId,
      });

      return {
        success: false,
        error: errorInfo,
        photoId: this.currentUpload?.photoId, // For retry
      };
    }
  }

  /**
   * Retry the last failed upload
   */
  async retryUpload() {
    if (!this.currentUpload) {
      return {
        success: false,
        error: {
          code: 'NO_PENDING_UPLOAD',
          title: 'No hay subida pendiente',
          message: 'No hay ninguna imagen para reintentar.',
        },
      };
    }

    const { imageURI, anuncioObject, photoId } = this.currentUpload;

    return this.uploadImage(imageURI, anuncioObject, {
      existingPhotoId: photoId, // Reuse existing AnuncioPhoto
      createThumbnail: true,
    });
  }
}

// Singleton instance
export const imageUploadManager = new ImageUploadManager();

// Legacy function for backward compatibility with s3API imports
export async function uploadImageDataToAWS(objectId, imageURI, contentType, resize) {
  try {
    const base64Data = await imageToBase64(imageURI);
    const result = await uploadToS3(objectId, base64Data, contentType);

    if (resize) {
      try {
        const thumbnailURI = await createThumbnail(imageURI);
        const thumbnailBase64 = await imageToBase64(thumbnailURI);
        const thumbnailKey = RESIZED_PREFIX + objectId;
        await uploadToS3(thumbnailKey, thumbnailBase64, 'image/jpeg');
      } catch (thumbnailError) {
        console.warn("Thumbnail creation failed:", thumbnailError);
        // Don't throw - thumbnail is not critical
      }
    }

    return result;
  } catch (error) {
    throw error;
  }
}

export default imageUploadManager;
