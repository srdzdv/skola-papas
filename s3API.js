/**
 * s3API.js - AWS S3 Upload utilities via Parse Cloud Functions
 *
 * Updated to handle new standardized API response format:
 * - Success: { success: true, data: { ... } }
 * - Error: { success: false, error: { code, message } }
 *
 * Maintains backward compatibility with legacy responses.
 */

const Parse = require('parse/react-native');
import * as ImageManipulator from 'expo-image-manipulator';
import { handleApiResponse, callCloudFunction, ApiErrorCode } from './services/ApiResponseHandler';

const RESIZED_PREFIX = "resized-";

/**
 * Get signed URL for legacy S3 bucket
 * @param {string} objectKey - S3 object key
 * @returns {Promise<string>} Signed URL
 */
export async function getOLDS3SignedUrl(objectKey) {
  const result = await callCloudFunction("getOLDAWSS3SignedUrl", { objectKey });

  if (result.success) {
    // New format: { signedUrl, expiresAt, expiresIn, objectKey }
    if (result.data.signedUrl) {
      return result.data.signedUrl;
    }
    // Legacy format wrapped: { legacyResponse: "url" }
    if (result.data.legacyResponse) {
      return result.data.legacyResponse;
    }
    // Legacy format: data is the URL string directly
    if (typeof result.data === 'string') {
      return result.data;
    }
    console.warn("getOLDS3SignedUrl: Unexpected response format", result.data);
    return '';
  }

  console.error("Error getting old S3 signed URL:", result.error);
  throw new Error(result.error.message);
}

/**
 * Get signed URL for new S3 bucket
 * @param {string} objectKey - S3 object key
 * @returns {Promise<string>} Signed URL
 */
export async function getSignedObjectUrl(objectKey) {
  const result = await callCloudFunction("getAWSS3SignedUrl", { objectKey });

  if (result.success) {
    // New format: { signedUrl, expiresAt, expiresIn, objectKey }
    if (result.data.signedUrl) {
      return result.data.signedUrl;
    }
    // Legacy format wrapped: { legacyResponse: "url" }
    if (result.data.legacyResponse) {
      return result.data.legacyResponse;
    }
    // Legacy format: data is the URL string directly
    if (typeof result.data === 'string') {
      return result.data;
    }
    console.warn("getSignedObjectUrl: Unexpected response format", result.data);
    return '';
  }

  console.error("Error getting signed URL:", result.error);
  throw new Error(result.error.message);
}

/**
 * Get signed URL with full metadata (new format only)
 * @param {string} objectKey - S3 object key
 * @returns {Promise<{signedUrl: string, expiresAt: string, expiresIn: number}>}
 */
export async function getSignedObjectUrlWithMetadata(objectKey) {
  const result = await callCloudFunction("getAWSS3SignedUrl", { objectKey });

  if (result.success) {
    // Return full metadata if available
    if (result.data.signedUrl) {
      return {
        signedUrl: result.data.signedUrl,
        expiresAt: result.data.expiresAt,
        expiresIn: result.data.expiresIn,
        objectKey: result.data.objectKey,
      };
    }
    // Legacy format - just URL
    return {
      signedUrl: result.data.legacyResponse || result.data,
      expiresAt: null,
      expiresIn: 3600, // Default 1 hour
      objectKey: objectKey,
    };
  }

  throw new Error(result.error.message);
}

/**
 * Convert image URI to base64
 * @private
 */
async function imageToBase64(imageURI) {
  const response = await fetch(imageURI);

  if (!response.ok) {
    throw new Error('No se pudo acceder al archivo de imagen');
  }

  const blob = await response.blob();

  // Check file size (max 10MB for images)
  if (blob.size > 10 * 1024 * 1024) {
    const error = new Error('La imagen es demasiado grande (máximo 10MB)');
    error.code = ApiErrorCode.FILE_TOO_LARGE;
    throw error;
  }

  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onloadend = () => {
      resolve(reader.result);
    };

    reader.onerror = () => {
      reject(new Error('Error al leer el archivo de imagen'));
    };

    reader.readAsDataURL(blob);
  });
}

/**
 * Upload base64 image data to S3 via Parse Cloud
 * @private
 * @returns {Promise<{objectKey: string, size: number, uploadedAt: string}>}
 */
async function uploadToS3(objectKey, base64Data, contentType) {
  const payload = {
    objectKey: objectKey,
    imageBase64: base64Data,
    contentType: contentType,
  };

  const result = await callCloudFunction("uploadAWSS3Object", payload);

  if (result.success) {
    console.log("S3_ImgUpload:", objectKey);

    // New format returns detailed data
    if (result.data.objectKey) {
      return {
        objectKey: result.data.objectKey,
        size: result.data.size,
        contentType: result.data.contentType,
        uploadedAt: result.data.uploadedAt,
        etag: result.data.etag,
      };
    }

    // Legacy format - just return success indicator
    return {
      objectKey: objectKey,
      success: true,
      legacyResponse: result.data.legacyResponse,
    };
  }

  // Handle specific error codes
  const error = new Error(result.error.message);
  error.code = result.error.code;
  error.title = result.error.title;
  throw error;
}

/**
 * Resize image and upload thumbnail
 * @private
 */
async function resizeAndUploadThumbnail(objectId, imageURI) {
  console.log("**resizeImage: " + objectId);

  try {
    // Resize the image with better quality settings
    const resizedImage = await ImageManipulator.manipulateAsync(
      imageURI,
      [{ resize: { width: 200 } }],
      { compress: 0.9, format: ImageManipulator.SaveFormat.JPEG }
    );

    // Convert to base64 and upload
    const base64Data = await imageToBase64(resizedImage.uri);
    const resizedObjId = RESIZED_PREFIX + objectId;

    await uploadToS3(resizedObjId, base64Data, 'image/jpeg');
    console.log("Thumbnail uploaded: " + resizedObjId);
  } catch (err) {
    // Log but don't throw - thumbnail failure shouldn't block main upload
    console.warn("ImageResizer_Error (non-critical): ", err);
  }
}

/**
 * Upload image data to AWS S3
 *
 * @param {string} objectId - The object ID to use as the S3 key
 * @param {string} imageURI - Local URI of the image
 * @param {string} contentType - MIME type (e.g., 'image/jpeg')
 * @param {boolean} resize - Whether to create and upload a thumbnail
 * @returns {Promise<{objectKey: string, size?: number, uploadedAt?: string}>}
 */
export async function uploadImageDataToAWS(objectId, imageURI, contentType, resize) {
  // Convert image to base64
  const base64Data = await imageToBase64(imageURI);

  // Upload main image
  const uploadResult = await uploadToS3(objectId, base64Data, contentType);

  // Create and upload thumbnail if requested
  if (resize) {
    await resizeAndUploadThumbnail(objectId, imageURI);
  }

  return uploadResult;
}

/**
 * Upload video to AWS S3
 * Videos have a higher size limit (100MB)
 *
 * @param {string} objectId - The object ID to use as the S3 key
 * @param {string} videoURI - Local URI of the video
 * @param {string} contentType - MIME type (e.g., 'video/mp4')
 * @returns {Promise<{objectKey: string, size?: number, uploadedAt?: string}>}
 */
export async function uploadVideoToAWS(objectId, videoURI, contentType) {
  const response = await fetch(videoURI);

  if (!response.ok) {
    throw new Error('No se pudo acceder al archivo de video');
  }

  const blob = await response.blob();

  // Check file size (max 100MB for videos)
  if (blob.size > 100 * 1024 * 1024) {
    const error = new Error('El video es demasiado grande (máximo 100MB)');
    error.code = ApiErrorCode.FILE_TOO_LARGE;
    throw error;
  }

  // Convert to base64
  const base64Data = await new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(reader.result);
    reader.onerror = () => reject(new Error('Error al leer el archivo de video'));
    reader.readAsDataURL(blob);
  });

  // Use uploadVideo cloud function if available, fallback to regular upload
  const payload = {
    objectKey: objectId,
    imageBase64: base64Data,
    contentType: contentType,
  };

  // Try video-specific endpoint first
  let result = await callCloudFunction("uploadVideo", payload);

  // Fallback to regular upload if video endpoint doesn't exist
  if (!result.success && result.error.code === 'PARSE_ERROR_141') {
    result = await callCloudFunction("uploadAWSS3Object", payload);
  }

  if (result.success) {
    console.log("S3_VideoUpload: " + objectId);
    return result.data.objectKey ? result.data : { objectKey: objectId, success: true };
  }

  const error = new Error(result.error.message);
  error.code = result.error.code;
  throw error;
}

// Legacy function name alias for backward compatibility
export const resizeImage = resizeAndUploadThumbnail;
