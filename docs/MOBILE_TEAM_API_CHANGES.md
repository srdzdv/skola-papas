# API Response Changes - Mobile Team Documentation

**Date:** January 2026
**Version:** 2.0

This document describes all changes made to the Cloud Functions API responses. These changes standardize the response format across all endpoints for consistent client-side handling.

---

## Table of Contents

1. [New Standardized Response Format](#new-standardized-response-format)
2. [Error Code Reference](#error-code-reference)
3. [S3 Storage Functions](#s3-storage-functions)
4. [Notification Functions](#notification-functions)
5. [Anuncios (Announcements) Functions](#anuncios-announcements-functions)
6. [Eventos (Events) Functions](#eventos-events-functions)
7. [Migration Guide](#migration-guide)

---

## New Standardized Response Format

### Success Response
```javascript
{
  success: true,
  data: {
    // Function-specific data
    timestamp: "2026-01-31T12:00:00.000Z"
  }
}
```

### Error Response
```javascript
{
  success: false,
  error: {
    code: "ERROR_CODE",
    message: "Human-readable error message"
  }
}
```

### How to Handle Responses (Mobile)
```javascript
const result = await Parse.Cloud.run("functionName", params);

if (result.success) {
  // Handle success - data is in result.data
  console.log(result.data);
} else {
  // Handle error - error details in result.error
  console.error(result.error.code, result.error.message);
}
```

---

## Error Code Reference

| Error Code | Description | User Action |
|------------|-------------|-------------|
| `INVALID_PARAMS` | Missing or invalid parameters | Check request parameters |
| `NOT_FOUND` | Resource not found | Verify object ID exists |
| `ANUNCIO_NOT_FOUND` | Announcement not found | Verify anuncio ID |
| `EVENTO_NOT_FOUND` | Event not found | Verify evento ID |
| `UNAUTHORIZED` | Access denied | Check user permissions |
| `FILE_TOO_LARGE` | File exceeds size limit | Reduce file size |
| `INVALID_FILE_TYPE` | Unsupported file format | Use supported format |
| `S3_ERROR` | Storage service error | Retry or contact support |
| `NOTIFICATION_FAILED` | Push notification failed | Check notification settings |
| `DELETE_FAILED` | Delete operation failed | Retry operation |
| `REMINDER_FAILED` | Event reminder failed | Check event data |

---

## S3 Storage Functions

### `getAWSS3SignedUrl` / `getOLDAWSS3SignedUrl`

**Before:**
```javascript
// Returns string URL or throws error
"https://s3.amazonaws.com/bucket/key?..."
```

**After:**
```javascript
// Success
{
  success: true,
  data: {
    signedUrl: "https://s3.amazonaws.com/bucket/key?...",
    expiresAt: "2026-01-31T13:00:00.000Z",
    expiresIn: 3600,  // seconds
    objectKey: "path/to/file.jpg"
  }
}

// Error
{
  success: false,
  error: {
    code: "NOT_FOUND",  // or "UNAUTHORIZED", "S3_ERROR"
    message: "El archivo no existe"
  }
}
```

---

### `uploadAWSS3Object`

**Before:**
```javascript
// Returns ETag string
"\"abc123def456...\""
```

**After:**
```javascript
// Success
{
  success: true,
  data: {
    objectKey: "path/to/file.jpg",
    size: 1234567,  // bytes
    contentType: "image/jpeg",
    uploadedAt: "2026-01-31T12:00:00.000Z",
    etag: "\"abc123def456...\"",
    bucket: "bucket-name"
  }
}

// Error (validation)
{
  success: false,
  error: {
    code: "FILE_TOO_LARGE",  // or "INVALID_FILE_TYPE", "INVALID_PARAMS"
    message: "El archivo excede el límite de 10MB"
  }
}
```

**Validation Rules:**
- Max image size: 10MB
- Allowed image types: `image/jpeg`, `image/jpg`, `image/png`, `image/gif`
- Allowed document types: `application/pdf`

---

### `uploadVideo`

**Before:**
```javascript
// Returns ETag string
"\"abc123def456...\""
```

**After:**
```javascript
// Success
{
  success: true,
  data: {
    objectKey: "path/to/video.mp4",
    size: 50000000,  // bytes
    contentType: "video/mp4",
    uploadedAt: "2026-01-31T12:00:00.000Z",
    etag: "\"abc123def456...\"",
    bucket: "bucket-name"
  }
}

// Error
{
  success: false,
  error: {
    code: "FILE_TOO_LARGE",
    message: "El archivo excede el límite de 100MB"
  }
}
```

**Validation Rules:**
- Max video size: 100MB
- Allowed video types: `video/mp4`, `video/quicktime`, `video/x-msvideo`, `video/x-ms-wmv`

---

### `initiateMultipartUpload`

**Before:**
```javascript
// Returns uploadId string
"abc123..."
```

**After:**
```javascript
// Success
{
  success: true,
  data: {
    uploadId: "abc123...",
    objectKey: "path/to/file",
    bucket: "bucket-name"
  }
}
```

---

### `uploadPart`

**Before:**
```javascript
// Returns ETag
{ ETag: "...", PartNumber: 1 }
```

**After:**
```javascript
// Success
{
  success: true,
  data: {
    ETag: "\"abc123...\"",
    PartNumber: 1
  }
}

// Error (includes partNumber for retry logic)
{
  success: false,
  error: {
    code: "S3_ERROR",
    message: "Error al procesar el archivo"
  },
  partNumber: 1
}
```

---

### `completeMultipartUpload`

**Before:**
```javascript
// Returns location string
"https://bucket.s3.amazonaws.com/key"
```

**After:**
```javascript
// Success
{
  success: true,
  data: {
    location: "https://bucket.s3.amazonaws.com/key",
    objectKey: "path/to/file",
    bucket: "bucket-name",
    etag: "\"abc123...\""
  }
}
```

---

## Notification Functions

### `informacionParentNotification`

**Before:**
```javascript
// Returns string
"informacion fetched correctly"
```

**After:**
```javascript
// Success
{
  success: true,
  data: {
    notificationType: "informacion",
    infoType: "diario",  // or other type
    escuelaId: "abc123",
    objectId: "xyz789",
    timestamp: "2026-01-31T12:00:00.000Z"
  }
}
```

---

### `momentosParentNotification`

**Before:**
```javascript
// Returns string
"momentos fetched correctly"
```

**After:**
```javascript
// Success
{
  success: true,
  data: {
    notificationType: "momentos",
    escuelaId: "abc123",
    momentoId: "xyz789",
    timestamp: "2026-01-31T12:00:00.000Z"
  }
}
```

---

### `pagoAdminNotification`

**Before:**
```javascript
// Returns string
"pago fetched correctly"
```

**After:**
```javascript
// Success
{
  success: true,
  data: {
    notificationType: "pago",
    pagoId: "xyz789",
    escuelaId: "abc123",
    timestamp: "2026-01-31T12:00:00.000Z"
  }
}
```

---

### `newProspectoAdminNotification`

**Before:**
```javascript
// Returns string
"prospecto sent"
```

**After:**
```javascript
// Success
{
  success: true,
  data: {
    notificationType: "prospecto",
    prospectoId: "xyz789",
    escuelaId: "abc123",
    timestamp: "2026-01-31T12:00:00.000Z"
  }
}
```

---

### `pagoCreadoNotification`

**Before:**
```javascript
// Returns string
"pagoCreadoNotification Success"
```

**After:**
```javascript
// Success
{
  success: true,
  data: {
    notificationType: "pago_creado",
    pagoId: "xyz789",
    estudianteId: "abc123",
    estudianteNombre: "Juan Pérez",
    expoTokensCount: 3,
    timestamp: "2026-01-31T12:00:00.000Z"
  }
}

// No tokens found
{
  success: true,
  data: {
    notificationType: "pago_creado",
    pagoId: "xyz789",
    estudianteId: "abc123",
    expoTokensCount: 0,
    message: "No expo tokens found for student",
    timestamp: "2026-01-31T12:00:00.000Z"
  }
}
```

---

### `pagoManualNotification`

**Before:**
```javascript
// Returns string
"pagoManualNotification Success"
```

**After:**
```javascript
// Success
{
  success: true,
  data: {
    notificationType: "pago_manual",
    pagoId: "xyz789",
    estudianteId: "abc123",
    estudianteNombre: "Juan Pérez",
    expoTokensCount: 3,
    timestamp: "2026-01-31T12:00:00.000Z"
  }
}
```

---

### `pagoRechazadoNotification`

**Before:**
```javascript
// Returns string
"pagoRechazadoNotification Success"
```

**After:**
```javascript
// Success
{
  success: true,
  data: {
    notificationType: "pago_rechazado",
    pagoId: "xyz789",
    estudianteId: "abc123",
    estudianteNombre: "Juan Pérez",
    expoTokensCount: 3,
    timestamp: "2026-01-31T12:00:00.000Z"
  }
}
```

---

### `servicioSolicitadoAdminNotification`

**Before:**
```javascript
// Returns string
"servicioSolicitado sent"
```

**After:**
```javascript
// Success
{
  success: true,
  data: {
    notificationType: "servicio_solicitado",
    servicioId: "xyz789",
    escuelaId: "abc123",
    timestamp: "2026-01-31T12:00:00.000Z"
  }
}
```

---

### `servicioSolicitadoNotifyParentStatusChanged`

**Before:**
```javascript
// Returns string
"servicioSolicitadoNotifyParentStatusChanged Success"
```

**After:**
```javascript
// Success
{
  success: true,
  data: {
    notificationType: "servicio_status_changed",
    servicioId: "xyz789",
    estudianteId: "abc123",
    estudianteNombre: "Juan Pérez",
    expoTokensCount: 3,
    timestamp: "2026-01-31T12:00:00.000Z"
  }
}
```

---

### `planeacionParentNotification`

**Before:**
```javascript
// Returns string
"planeacion fetched correctly"
```

**After:**
```javascript
// Success
{
  success: true,
  data: {
    notificationType: "planeacion",
    planeacionId: "xyz789",
    escuelaId: "abc123",
    timestamp: "2026-01-31T12:00:00.000Z"
  }
}
```

---

### `sendAnuncioSeenByEscuelaNotification`

**Before:**
```javascript
// Returns string or undefined
"sendAnuncioSeenByEscuelaNotification Success"
```

**After:**
```javascript
// Success
{
  success: true,
  data: {
    notificationType: "anuncio_seen",
    anuncioId: "xyz789",
    estudianteId: "abc123",
    estudianteNombre: "Juan Pérez",
    expoTokensCount: 3,
    timestamp: "2026-01-31T12:00:00.000Z"
  }
}

// Anuncio not found
{
  success: false,
  error: {
    code: "NOT_FOUND",
    message: "Anuncio no encontrado"
  }
}
```

---

## Anuncios (Announcements) Functions

### `rechazarAnuncioMaestra`

**Before:**
```javascript
// Returns string or throws error
"Anuncio deleted"
```

**After:**
```javascript
// Success
{
  success: true,
  data: {
    anuncioId: "xyz789",
    deleted: true,
    timestamp: "2026-01-31T12:00:00.000Z"
  }
}

// Error
{
  success: false,
  error: {
    code: "DELETE_FAILED",
    message: "Error message"
  }
}
```

---

### `parentAnuncioCreated`

**Before:**
```javascript
// Returns string
"parentAnuncioCreated: [message]"
```

**After:**
```javascript
// Success
{
  success: true,
  data: {
    anuncioId: "xyz789",
    estudianteId: "abc123",
    estudianteNombre: "Juan Pérez",
    parentesco: "Mamá",
    destino: "teacher",  // or "admin"
    notificationsSent: 2,
    timestamp: "2026-01-31T12:00:00.000Z"
  }
}

// Anuncio not found
{
  success: false,
  error: {
    code: "ANUNCIO_NOT_FOUND",
    message: "Anuncio no encontrado"
  }
}
```

---

### `saveRSVP` / `deleteRSVP`

**Before:**
```javascript
// Returns string
"rsvp saved" / "rsvp deleted"
```

**After:**
```javascript
// Success
{
  success: true,
  data: {
    escuelaId: "abc123",
    action: "saved",  // or "deleted"
    timestamp: "2026-01-31T12:00:00.000Z"
  }
}
```

---

### `teacherAnuncioToBeApproved`

**Before:**
```javascript
// Returns string
"teacherAnuncioToBeApproved: [message]"
```

**After:**
```javascript
// Success
{
  success: true,
  data: {
    anuncioId: "xyz789",
    autorUsername: "teacher@school.com",
    requiresApproval: true,
    timestamp: "2026-01-31T12:00:00.000Z"
  }
}

// Anuncio not found
{
  success: false,
  error: {
    code: "ANUNCIO_NOT_FOUND",
    message: "Anuncio no encontrado"
  }
}
```

---

### `adminApprovedAnuncio`

**Before:**
```javascript
// Returns undefined (no return statement)
```

**After:**
```javascript
// Success - Group message
{
  success: true,
  data: {
    anuncioId: "xyz789",
    targetType: "grupo",
    recipientsCount: 45,
    notificationsSent: 120,  // Total expo tokens
    timestamp: "2026-01-31T12:00:00.000Z"
  }
}

// Success - Individual message
{
  success: true,
  data: {
    anuncioId: "xyz789",
    targetType: "individual",
    recipientsCount: 1,
    notificationsSent: 3,  // Number of tokens for that student
    timestamp: "2026-01-31T12:00:00.000Z"
  }
}

// Anuncio not found
{
  success: false,
  error: {
    code: "ANUNCIO_NOT_FOUND",
    message: "Anuncio no encontrado"
  }
}
```

---

## Eventos (Events) Functions

### `eventoParentNotification`

**Before:**
```javascript
// Returns string
"Evento fetched correctly"
```

**After:**
```javascript
// Success
{
  success: true,
  data: {
    eventoId: "xyz789",
    eventoNombre: "Día del Padre",
    escuelaId: "abc123",
    isUpdate: false,  // true if event was updated
    publicoCount: 3,  // or "all"
    timestamp: "2026-01-31T12:00:00.000Z"
  }
}

// Event not found
{
  success: false,
  error: {
    code: "EVENTO_NOT_FOUND",
    message: "Evento no encontrado"
  }
}
```

---

### `eventoFotoNueva`

**Before:**
```javascript
// Returns string
"Success/eventoFotoNueva"
```

**After:**
```javascript
// Success
{
  success: true,
  data: {
    eventoId: "xyz789",
    eventoNombre: "Día del Padre",
    escuelaId: "abc123",
    action: "foto_nueva",
    publicoCount: 3,  // or "all"
    timestamp: "2026-01-31T12:00:00.000Z"
  }
}

// Event not found
{
  success: false,
  error: {
    code: "EVENTO_NOT_FOUND",
    message: "Evento no encontrado"
  }
}
```

---

### `eventReminder` (CRON Job)

**Before:**
```javascript
// Returns string
"eventReminder NO events found."
```

**After:**
```javascript
// Success - Events found
{
  success: true,
  data: {
    eventsFound: 3,
    remindersSent: [
      { eventoId: "xyz1", eventoNombre: "Evento 1", escuelaId: "abc1", sent: true },
      { eventoId: "xyz2", eventoNombre: "Evento 2", escuelaId: "abc2", sent: true },
      { eventoId: "xyz3", eventoNombre: "Evento 3", escuelaId: "abc3", sent: true }
    ],
    timestamp: "2026-01-31T12:00:00.000Z"
  }
}

// Success - No events
{
  success: true,
  data: {
    eventsFound: 0,
    message: "No hay eventos programados para mañana",
    timestamp: "2026-01-31T12:00:00.000Z"
  }
}
```

---

## Migration Guide

### Step 1: Update Response Handling

**Old pattern:**
```javascript
try {
  const result = await Parse.Cloud.run("uploadAWSS3Object", params);
  // result was ETag string
  console.log("Upload successful:", result);
} catch (error) {
  console.error("Upload failed:", error);
}
```

**New pattern:**
```javascript
const result = await Parse.Cloud.run("uploadAWSS3Object", params);

if (result.success) {
  console.log("Upload successful:", result.data.objectKey);
  console.log("File size:", result.data.size);
} else {
  // Handle specific error codes
  switch (result.error.code) {
    case 'FILE_TOO_LARGE':
      alert("El archivo es muy grande. Máximo 10MB.");
      break;
    case 'INVALID_FILE_TYPE':
      alert("Formato no soportado. Use JPG, PNG o PDF.");
      break;
    default:
      alert(result.error.message);
  }
}
```

### Step 2: Update Error Handling

Create a centralized error handler:

```javascript
function handleApiError(error) {
  const errorMessages = {
    'INVALID_PARAMS': 'Faltan datos requeridos',
    'NOT_FOUND': 'No se encontró el recurso',
    'FILE_TOO_LARGE': 'El archivo es muy grande',
    'INVALID_FILE_TYPE': 'Formato de archivo no soportado',
    'UNAUTHORIZED': 'No tienes permiso para esta acción',
    'S3_ERROR': 'Error al subir archivo, intenta de nuevo',
    'NOTIFICATION_FAILED': 'Error al enviar notificación'
  };

  return errorMessages[error.code] || error.message;
}
```

### Step 3: Type Definitions (TypeScript)

```typescript
interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: {
    code: string;
    message: string;
  };
}

interface UploadResponse {
  objectKey: string;
  size: number;
  contentType: string;
  uploadedAt: string;
  etag: string;
  bucket: string;
}

interface SignedUrlResponse {
  signedUrl: string;
  expiresAt: string;
  expiresIn: number;
  objectKey: string;
}
```

---

## Questions?

Contact the backend team if you have questions about these changes.
