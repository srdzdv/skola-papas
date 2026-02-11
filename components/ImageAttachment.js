import React, { useState, useEffect, useRef, useCallback, memo } from 'react';
import * as ImagePicker from 'expo-image-picker';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { Image as ExpoImage } from 'expo-image';
import Colors from '../constants/Colors';

import {
  View,
  StyleSheet,
  Text,
  Pressable,
  Dimensions,
  Alert,
  Platform,
  ActivityIndicator,
} from 'react-native';

const screenWidth = Dimensions.get('window').width;

// Error messages in Spanish
const ERROR_MESSAGES = {
  PERMISSION_CAMERA: 'La app no tiene permiso para usar la cámara. Habilita el permiso en Configuración.',
  PERMISSION_PHOTOS: 'La app no tiene permiso para acceder a tus fotos. Habilita el permiso en Configuración.',
  CAMERA_ERROR: 'Hubo un problema al tomar la foto. Intenta de nuevo.',
  PICKER_ERROR: 'Hubo un problema al seleccionar la imagen. Intenta de nuevo.',
  GENERAL_ERROR: 'Ocurrió un error inesperado. Intenta de nuevo.',
};

/**
 * ImageAttachment - Component for selecting/capturing images
 *
 * Features:
 * - Photo library selection
 * - Camera capture
 * - Preview display
 * - Error handling with user-friendly messages
 * - Loading states
 */
const ImageAttachment = memo(function ImageAttachment({
  onImageSelected,
  disabled = false,
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const [imageData, setImageData] = useState(null);
  const [showCamera, setShowCamera] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [facing, setFacing] = useState('back');

  const cameraRef = useRef(null);

  // Request camera permission on iOS
  useEffect(() => {
    if (Platform.OS === 'ios' && !permission) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  // Notify parent when image changes
  useEffect(() => {
    if (imageData?.uri) {
      onImageSelected(imageData.uri);
    }
  }, [imageData, onImageSelected]);

  /**
   * Show an error alert
   */
  const showError = useCallback((message) => {
    Alert.alert('Error', message, [{ text: 'Ok', style: 'default' }]);
  }, []);

  /**
   * Pick image from photo library
   */
  const pickImage = useCallback(async () => {
    if (disabled || isProcessing) return;

    try {
      setIsProcessing(true);

      // Check permissions on iOS
      if (Platform.OS === 'ios') {
        const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
        if (status !== 'granted') {
          showError(ERROR_MESSAGES.PERMISSION_PHOTOS);
          setIsProcessing(false);
          return;
        }
      }

      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: false,
        quality: 0.8,
      });

      if (!result.canceled && result.assets?.[0]) {
        const asset = result.assets[0];
        setImageData({
          uri: asset.uri,
          height: asset.height / 8,
          width: asset.width / 8,
        });
      }
    } catch (error) {
      console.error('Image picker error:', error);
      showError(ERROR_MESSAGES.PICKER_ERROR);
    } finally {
      setIsProcessing(false);
    }
  }, [disabled, isProcessing, showError]);

  /**
   * Open camera for photo capture
   */
  const openCamera = useCallback(() => {
    if (disabled || isProcessing) return;

    if (!permission?.granted) {
      Alert.alert(
        'Permiso requerido',
        ERROR_MESSAGES.PERMISSION_CAMERA,
        [
          { text: 'Cancelar', style: 'cancel' },
          { text: 'Solicitar permiso', onPress: requestPermission },
        ]
      );
      return;
    }

    setShowCamera(true);
  }, [disabled, isProcessing, permission, requestPermission]);

  /**
   * Take photo with camera
   */
  const takePhoto = useCallback(async () => {
    if (!cameraRef.current) return;

    try {
      setIsProcessing(true);
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
      });

      setShowCamera(false);
      setImageData({
        uri: photo.uri,
        height: photo.height / 5,
        width: photo.width / 5,
      });
    } catch (error) {
      console.error('Camera error:', error);
      showError(ERROR_MESSAGES.CAMERA_ERROR);
    } finally {
      setIsProcessing(false);
    }
  }, [showError]);

  /**
   * Toggle camera facing direction
   */
  const toggleCameraFacing = useCallback(() => {
    setFacing(current => (current === 'back' ? 'front' : 'back'));
  }, []);

  /**
   * Close camera without taking photo
   */
  const closeCamera = useCallback(() => {
    setShowCamera(false);
  }, []);

  /**
   * Show options to select image source
   */
  const showImageOptions = useCallback(() => {
    if (disabled || isProcessing) return;

    Alert.alert(
      'Adjuntar Imagen',
      'Selecciona una opción',
      [
        { text: 'Carrete de fotos', onPress: pickImage, style: 'default' },
        { text: 'Cámara', onPress: openCamera, style: 'default' },
        { text: 'Cancelar', style: 'cancel' },
      ],
      { cancelable: true }
    );
  }, [disabled, isProcessing, pickImage, openCamera]);

  return (
    <View style={styles.container}>
      {/* Attach Image Button */}
      <Pressable
        onPress={showImageOptions}
        disabled={disabled || isProcessing}
        style={({ pressed }) => [
          styles.attachButton,
          pressed && styles.attachButtonPressed,
          disabled && styles.attachButtonDisabled,
        ]}
      >
        {isProcessing ? (
          <ActivityIndicator size="small" color={Colors.actionColor} />
        ) : (
          <View style={styles.attachButtonContent}>
            <ExpoImage
              style={styles.attachmentIcon}
              source={require('../assets/images/attachmentIconWhite.png')}
              contentFit="contain"
            />
            <Text style={[
              styles.btnText,
              disabled && styles.btnTextDisabled,
            ]}>
              Adjuntar Imagen
            </Text>
          </View>
        )}
      </Pressable>

      {/* Image Preview */}
      {imageData?.uri ? (
        <ExpoImage
          style={[
            styles.preview,
            { height: imageData.height, width: imageData.width },
          ]}
          source={{ uri: imageData.uri }}
          contentFit="cover"
          transition={200}
        />
      ) : null}

      {/* Camera View */}
      {showCamera ? (
        <View style={styles.cameraContainer}>
          <CameraView
            ref={cameraRef}
            style={styles.camera}
            facing={facing}
          >
            <View style={styles.cameraControls}>
              <Pressable
                style={styles.cameraButton}
                onPress={toggleCameraFacing}
              >
                <Text style={styles.cameraButtonText}>Voltear</Text>
              </Pressable>

              <Pressable
                style={[styles.cameraButton, styles.snapButton]}
                onPress={takePhoto}
                disabled={isProcessing}
              >
                {isProcessing ? (
                  <ActivityIndicator size="small" color="white" />
                ) : (
                  <Text style={styles.snapButtonText}>Tomar</Text>
                )}
              </Pressable>

              <Pressable
                style={styles.cameraButton}
                onPress={closeCamera}
              >
                <Text style={styles.closeButtonText}>Cerrar</Text>
              </Pressable>
            </View>
          </CameraView>
        </View>
      ) : null}
    </View>
  );
});

export default ImageAttachment;

const styles = StyleSheet.create({
  container: {
    width: screenWidth - 16,
    alignItems: 'center',
  },
  attachButton: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    padding: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  attachButtonPressed: {
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
  },
  attachButtonDisabled: {
    opacity: 0.5,
  },
  attachButtonContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  attachmentIcon: {
    height: 20,
    width: 20,
    marginRight: 8,
  },
  btnText: {
    color: Colors.actionColor,
    fontWeight: '600',
    fontSize: 16,
  },
  btnTextDisabled: {
    color: 'rgba(255, 255, 255, 0.5)',
  },
  preview: {
    borderRadius: 8,
    marginTop: 16,
  },
  cameraContainer: {
    flex: 1,
    marginTop: 16,
    marginBottom: 16,
    borderRadius: 12,
    overflow: 'hidden',
  },
  camera: {
    width: screenWidth - 16,
    height: 300,
  },
  cameraControls: {
    flex: 1,
    backgroundColor: 'transparent',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    padding: 16,
  },
  cameraButton: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  cameraButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '500',
  },
  snapButton: {
    backgroundColor: Colors.bluejeansDark,
    paddingHorizontal: 24,
  },
  snapButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '700',
  },
  closeButtonText: {
    color: '#ff6b6b',
    fontSize: 16,
    fontWeight: '500',
  },
});
