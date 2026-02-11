import React, { useState, useEffect, useCallback, useRef } from 'react';
import { trackEvent } from "@aptabase/react-native";
import { Image as ExpoImage } from 'expo-image';
import Colors from '../constants/Colors';
import AsyncStorage from '@react-native-async-storage/async-storage';
import imageUploadManager, { UploadState, getErrorMessage } from '../services/ImageUploadService';
import { callCloudFunction } from '../services/ApiResponseHandler';

const Parse = require('parse/react-native');

import {
  TextInput,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  Pressable,
  View,
  Dimensions,
  ActivityIndicator,
  Alert,
  DeviceEventEmitter,
  KeyboardAvoidingView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import ImageAttachment from '../components/ImageAttachment.js';

const screenWidth = Dimensions.get('window').width;

// Upload status messages
const UPLOAD_STATUS_MESSAGES = {
  preparing: 'Preparando imagen...',
  converting: 'Procesando imagen...',
  uploading: 'Subiendo imagen...',
  resizing: 'Optimizando imagen...',
  complete: 'Imagen subida',
};

export default function MensajeDirecto({ navigation, route }) {
  // Get params
  const currentEstudianteObjId = route.params?.currentEstudiante;

  // State
  const [currentEstudiante, setCurrentEstudiante] = useState(currentEstudianteObjId);
  const [currentEscuela, setCurrentEscuela] = useState(null);
  const [pickerData, setPickerData] = useState([]);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [tipoAnuncioSelectedString, setTipoAnuncioSelectedString] = useState('Mensaje');
  const [tipoAnuncioObjId, setTipoAnuncioObjId] = useState('x4vjgZQVpB');
  const [mensajeTextInput, setMensajeTextInput] = useState('');
  const [selectedImageURL, setSelectedImageURL] = useState('');
  const [uploadStatus, setUploadStatus] = useState('');
  const [uploadProgress, setUploadProgress] = useState(0);
  const [pendingRetry, setPendingRetry] = useState(null);

  // Refs
  const currentUserRef = useRef(null);
  const selectedURLRef = useRef('');
  const isSubmittingRef = useRef(false);

  // Initialize
  useEffect(() => {
    getCurrentUser();
    getCurrentEstudiante();
    fetchTipoAnuncio();

    // Listen for upload state changes
    const unsubscribe = imageUploadManager.addListener(handleUploadStateChange);
    return () => unsubscribe();
  }, []);

  /**
   * Handle upload state changes
   */
  const handleUploadStateChange = useCallback(({ state, error, photoId }) => {
    switch (state) {
      case UploadState.ERROR:
        setPendingRetry({ photoId, error });
        break;
      case UploadState.SUCCESS:
        setPendingRetry(null);
        break;
      case UploadState.IDLE:
        setPendingRetry(null);
        setUploadStatus('');
        setUploadProgress(0);
        break;
      default:
        break;
    }
  }, []);

  /**
   * Get current user from Parse
   */
  const getCurrentUser = useCallback(async () => {
    try {
      const user = await Parse.User.currentAsync();
      if (user) {
        currentUserRef.current = user;
        const escuela = user.get('escuela');
        setCurrentEscuela(escuela);
      }
    } catch (error) {
      console.error('Error getting current user:', error);
    }
  }, []);

  /**
   * Get current student from AsyncStorage
   */
  const getCurrentEstudiante = useCallback(async () => {
    try {
      const storedEstudianteId = await AsyncStorage.getItem('currentEstudianteID');
      if (storedEstudianteId && storedEstudianteId !== currentEstudiante) {
        setCurrentEstudiante(storedEstudianteId);
      }
    } catch (error) {
      console.error('Error getting estudiante from AsyncStorage:', error);
    }
  }, [currentEstudiante]);

  /**
   * Fetch message types from Parse
   */
  const fetchTipoAnuncio = useCallback(async () => {
    try {
      const TipoAnuncio = Parse.Object.extend("tipoAnuncio");
      const query = new Parse.Query(TipoAnuncio);
      query.exists("nombre");
      query.ascending("createdAt");
      query.limit(11);
      query.select("nombre");

      const results = await query.find();
      const tipoAnuncioArr = results.map((object, index) => {
        const nombre = object.get('nombre');
        if (nombre === 'Mensaje') {
          setTipoAnuncioObjId(object.id);
        }
        return {
          key: index,
          nombre,
          id: object.id,
        };
      });

      setPickerData(tipoAnuncioArr);
    } catch (error) {
      console.error('Error fetching tipo anuncio:', error);
      presentFeedback(
        'Error de conexión',
        'No pudimos cargar los tipos de mensaje. Verifica tu conexión.',
        false
      );
    }
  }, []);

  /**
   * Show feedback alert
   */
  const presentFeedback = useCallback((title, message, shouldGoBack) => {
    Alert.alert(
      title,
      message,
      [{
        text: 'Ok',
        onPress: shouldGoBack ? () => navigation.goBack() : null,
        style: 'default',
      }],
      { cancelable: false }
    );
  }, [navigation]);

  /**
   * Handle image selection
   */
  const handleImageSelected = useCallback((imageURL) => {
    if (imageURL && selectedURLRef.current === '') {
      selectedURLRef.current = imageURL;
      setSelectedImageURL(imageURL);
    }
  }, []);

  /**
   * Clear selected image
   */
  const clearSelectedImage = useCallback(() => {
    selectedURLRef.current = '';
    setSelectedImageURL('');
    imageUploadManager.reset();
    setPendingRetry(null);
  }, []);

  /**
   * Check if form is valid
   */
  const isFormValid = useCallback(() => {
    return mensajeTextInput.trim().length > 0 && tipoAnuncioSelectedString.length > 0;
  }, [mensajeTextInput, tipoAnuncioSelectedString]);

  /**
   * Handle send button press
   */
  const handleSendMessage = useCallback(async () => {
    // Prevent double submission
    if (isLoading || isSubmittingRef.current) {
      return;
    }

    if (!isFormValid()) {
      if (mensajeTextInput.trim().length === 0) {
        presentFeedback('Mensaje vacío', 'Escribe un mensaje para poder enviar.', false);
      } else {
        presentFeedback('Asunto vacío', 'Selecciona un asunto para enviar el mensaje.', false);
      }
      return;
    }

    isSubmittingRef.current = true;
    setIsLoading(true);

    try {
      // Step 1: Create Anuncio
      const anuncio = await createAnuncio();

      // Step 2: Upload image if selected
      if (selectedImageURL) {
        await uploadAttachmentImage(anuncio);
      }

      // Step 3: Notify via cloud code
      await notifyCloudCode(anuncio.id);

      // Success
      trackEvent("mensaje_sent", {
        escuela: currentEscuela?.id || '',
        hasAttachment: Boolean(selectedImageURL),
      });

      DeviceEventEmitter.emit("refreshAnuncioList");
      presentFeedback(
        'Mensaje enviado',
        'El mensaje ha sido enviado a la escuela exitosamente.',
        true
      );

    } catch (error) {
      console.error('Error sending message:', error);

      // Check if it's an upload error with retry option
      if (pendingRetry) {
        showRetryDialog(pendingRetry.error);
      } else {
        const errorInfo = getErrorMessage(error);
        presentFeedback(errorInfo.title, errorInfo.message, false);
      }
    } finally {
      setIsLoading(false);
      isSubmittingRef.current = false;
    }
  }, [
    isLoading,
    isFormValid,
    mensajeTextInput,
    selectedImageURL,
    currentEscuela,
    pendingRetry,
    presentFeedback,
  ]);

  /**
   * Create Anuncio object in Parse
   */
  const createAnuncio = useCallback(async () => {
    const TipoAnuncio = Parse.Object.extend("tipoAnuncio");
    const tipoAnuncio = new TipoAnuncio();
    tipoAnuncio.id = tipoAnuncioObjId;

    const Estudiante = Parse.Object.extend("Estudiantes");
    const estudiante = new Estudiante();
    estudiante.id = currentEstudiante;

    const Anuncio = Parse.Object.extend("anuncio");
    const anuncio = new Anuncio();

    anuncio.set("materia", "");
    anuncio.set("autor", currentUserRef.current);
    anuncio.set("aprobado", true);
    anuncio.set("sentFrom", "RN");
    anuncio.set("estudiante", estudiante);
    anuncio.set("tipo", tipoAnuncio);
    anuncio.set("descripcion", mensajeTextInput);

    const savedAnuncio = await anuncio.save();
    return savedAnuncio;
  }, [tipoAnuncioObjId, currentEstudiante, mensajeTextInput]);

  /**
   * Upload attachment image
   */
  const uploadAttachmentImage = useCallback(async (anuncioObject) => {
    const result = await imageUploadManager.uploadImage(
      selectedImageURL,
      anuncioObject,
      {
        existingPhotoId: pendingRetry?.photoId,
        createThumbnail: true,
        onProgress: ({ step, percent }) => {
          setUploadStatus(UPLOAD_STATUS_MESSAGES[step] || 'Procesando...');
          setUploadProgress(percent);
        },
      }
    );

    if (!result.success) {
      throw new Error(result.error?.message || 'Error al subir imagen');
    }

    return result;
  }, [selectedImageURL, pendingRetry]);

  /**
   * Notify cloud code about new message
   * Handles new standardized response format
   */
  const notifyCloudCode = useCallback(async (anuncioObjId) => {
    const params = {
      anuncioObjectId: anuncioObjId,
      escuelaObjId: currentEscuela?.id,
    };

    const result = await callCloudFunction("parentAnuncioCreated", params, {
      legacySuccessValue: 'sent', // Legacy format returned "sent" string
    });

    if (!result.success) {
      // Log but don't throw - notification failure shouldn't block message sending
      console.warn("Notification failed:", result.error);
    }

    return result;
  }, [currentEscuela]);

  /**
   * Show retry dialog for failed upload
   */
  const showRetryDialog = useCallback((error) => {
    Alert.alert(
      error?.title || 'Error al subir imagen',
      `${error?.message || 'Hubo un problema al subir la imagen.'}\n\n¿Deseas intentar de nuevo?`,
      [
        {
          text: 'Cancelar',
          style: 'cancel',
          onPress: () => {
            imageUploadManager.reset();
            setPendingRetry(null);
          },
        },
        {
          text: 'Reintentar',
          style: 'default',
          onPress: () => {
            handleSendMessage();
          },
        },
      ],
      { cancelable: false }
    );
  }, [handleSendMessage]);

  /**
   * Toggle dropdown
   */
  const toggleDropdown = useCallback(() => {
    setDropdownOpen(prev => !prev);
  }, []);

  /**
   * Select dropdown option
   */
  const selectOption = useCallback((item) => {
    setTipoAnuncioSelectedString(item.nombre);
    setTipoAnuncioObjId(item.id);
    setDropdownOpen(false);
  }, []);

  /**
   * Handle text input change
   */
  const handleTextChange = useCallback((text) => {
    setMensajeTextInput(text);
    setDropdownOpen(false);
  }, []);

  /**
   * Go back
   */
  const handleBack = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  // Render dropdown
  const renderDropdown = () => (
    <View style={styles.dropdownContainer}>
      <Text style={styles.labelText}>Asunto</Text>
      <Pressable
        style={({ pressed }) => [
          styles.dropdownSelector,
          pressed && styles.dropdownSelectorPressed,
        ]}
        onPress={toggleDropdown}
      >
        <Text style={styles.dropdownSelectorText}>
          {tipoAnuncioSelectedString || "Seleccionar asunto"}
        </Text>
        <Text style={styles.dropdownChevron}>
          {dropdownOpen ? "▲" : "▼"}
        </Text>
      </Pressable>

      {dropdownOpen ? (
        <View style={styles.dropdownList}>
          {pickerData.filter(item => item.nombre).map((item) => (
            <Pressable
              key={item.key}
              style={({ pressed }) => [
                styles.dropdownItem,
                tipoAnuncioSelectedString === item.nombre && styles.dropdownItemSelected,
                pressed && styles.dropdownItemPressed,
              ]}
              onPress={() => selectOption(item)}
            >
              <Text style={[
                styles.dropdownItemText,
                tipoAnuncioSelectedString === item.nombre && styles.dropdownItemTextSelected,
              ]}>
                {item.nombre}
              </Text>
              {tipoAnuncioSelectedString === item.nombre ? (
                <Text style={styles.checkmark}>✓</Text>
              ) : null}
            </Pressable>
          ))}
        </View>
      ) : null}
    </View>
  );

  // Render message input
  const renderMessageInput = () => (
    <View style={styles.inputCard}>
      <Text style={styles.labelText}>Mensaje</Text>
      <View style={styles.textInputContainer}>
        <TextInput
          style={styles.textInput}
          multiline
          onChangeText={handleTextChange}
          value={mensajeTextInput}
          dataDetectorTypes="link"
          placeholder="Escribe tu mensaje aquí..."
          placeholderTextColor="#999"
          textAlignVertical="top"
          editable={!isLoading}
        />
      </View>
      <Text style={styles.charCount}>
        {mensajeTextInput.length} caracteres
      </Text>
    </View>
  );

  // Render attachment section
  const renderAttachmentSection = () => (
    <View style={styles.attachmentCard}>
      <Text style={styles.labelText}>Adjuntos</Text>

      {selectedImageURL ? (
        <View style={styles.attachmentPreviewContainer}>
          <ExpoImage
            source={{ uri: selectedImageURL }}
            style={styles.attachmentPreview}
            contentFit="cover"
            transition={200}
          />
          {uploadStatus ? (
            <View style={styles.uploadOverlay}>
              <ActivityIndicator size="small" color="white" />
              <Text style={styles.uploadStatusText}>{uploadStatus}</Text>
              <View style={styles.progressBar}>
                <View style={[styles.progressFill, { width: `${uploadProgress}%` }]} />
              </View>
            </View>
          ) : null}
          {!isLoading ? (
            <Pressable
              style={styles.removeAttachmentBtn}
              onPress={clearSelectedImage}
            >
              <Text style={styles.removeAttachmentText}>✕</Text>
            </Pressable>
          ) : null}
        </View>
      ) : (
        <ImageAttachment
          onImageSelected={handleImageSelected}
          disabled={isLoading}
        />
      )}
    </View>
  );

  // Render send button
  const renderSendButton = () => {
    const isValid = isFormValid();

    return (
      <View style={styles.sendButtonContainer}>
        <Pressable
          style={({ pressed }) => [
            styles.sendButton,
            !isValid && styles.sendButtonDisabled,
            pressed && isValid && styles.sendButtonPressed,
          ]}
          onPress={handleSendMessage}
          disabled={!isValid || isLoading}
        >
          {isLoading ? (
            <View style={styles.loadingContainer}>
              <ActivityIndicator size="small" color={Colors.bluejeansDark} />
              <Text style={styles.loadingText}>
                {uploadStatus || 'Enviando...'}
              </Text>
            </View>
          ) : (
            <Text style={[
              styles.sendButtonText,
              !isValid && styles.sendButtonTextDisabled,
            ]}>
              Enviar Mensaje
            </Text>
          )}
        </Pressable>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        {/* Header */}
        <View style={styles.header}>
          <Pressable
            onPress={handleBack}
            style={styles.backButton}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            disabled={isLoading}
          >
            <Text style={styles.backBtnText}>←</Text>
          </Pressable>
          <View style={styles.headerTitleContainer}>
            <Text style={styles.headerTitle}>Nuevo Mensaje</Text>
          </View>
          <View style={styles.headerSpacer} />
        </View>

        {/* Main Content */}
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.contentContainer}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {renderDropdown()}
          {renderMessageInput()}
          {renderAttachmentSection()}
          <View style={styles.bottomSpacer} />
        </ScrollView>

        {/* Fixed Send Button */}
        {renderSendButton()}
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.bluejeansLight,
  },
  keyboardView: {
    flex: 1,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    backgroundColor: Colors.bluejeansLight,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255, 255, 255, 0.15)',
  },
  backButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
  },
  backBtnText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 24,
  },
  headerTitleContainer: {
    flex: 1,
    alignItems: 'center',
  },
  headerTitle: {
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
  },
  headerSpacer: {
    width: 40,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    paddingHorizontal: 16,
    paddingTop: 16,
  },

  // Labels
  labelText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },

  // Dropdown
  dropdownContainer: {
    marginBottom: 16,
  },
  dropdownSelector: {
    backgroundColor: 'white',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  dropdownSelectorPressed: {
    backgroundColor: '#f5f5f5',
  },
  dropdownSelectorText: {
    fontSize: 16,
    color: Colors.darkGrayDark,
  },
  dropdownChevron: {
    fontSize: 12,
    color: Colors.darkGrayLight,
  },
  dropdownList: {
    backgroundColor: 'white',
    borderRadius: 12,
    marginTop: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.15,
    shadowRadius: 8,
    elevation: 5,
    overflow: 'hidden',
  },
  dropdownItem: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dropdownItemPressed: {
    backgroundColor: '#f5f5f5',
  },
  dropdownItemSelected: {
    backgroundColor: Colors.bluejeansLight + '15',
  },
  dropdownItemText: {
    fontSize: 16,
    color: Colors.darkGrayDark,
  },
  dropdownItemTextSelected: {
    color: Colors.bluejeansDark,
    fontWeight: '600',
  },
  checkmark: {
    color: Colors.bluejeansDark,
    fontSize: 16,
    fontWeight: 'bold',
  },

  // Message Input Card
  inputCard: {
    marginBottom: 16,
  },
  textInputContainer: {
    backgroundColor: 'white',
    borderRadius: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  textInput: {
    minHeight: 150,
    maxHeight: 300,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 14,
    fontSize: 16,
    color: Colors.darkGrayDark,
    lineHeight: 22,
  },
  charCount: {
    color: 'rgba(255, 255, 255, 0.6)',
    fontSize: 12,
    textAlign: 'right',
    marginTop: 6,
  },

  // Attachment Card
  attachmentCard: {
    marginBottom: 16,
  },
  attachmentPreviewContainer: {
    position: 'relative',
    backgroundColor: 'white',
    borderRadius: 12,
    padding: 12,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  attachmentPreview: {
    width: '100%',
    height: 200,
    borderRadius: 8,
  },
  uploadOverlay: {
    position: 'absolute',
    top: 12,
    left: 12,
    right: 12,
    bottom: 12,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    borderRadius: 8,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
  },
  uploadStatusText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
    marginTop: 8,
    textAlign: 'center',
  },
  progressBar: {
    width: '80%',
    height: 4,
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    borderRadius: 2,
    marginTop: 12,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: Colors.actionColor,
    borderRadius: 2,
  },
  removeAttachmentBtn: {
    position: 'absolute',
    top: 20,
    right: 20,
    backgroundColor: 'rgba(0, 0, 0, 0.6)',
    width: 28,
    height: 28,
    borderRadius: 14,
    justifyContent: 'center',
    alignItems: 'center',
  },
  removeAttachmentText: {
    color: 'white',
    fontSize: 14,
    fontWeight: 'bold',
  },

  // Send Button
  sendButtonContainer: {
    paddingHorizontal: 16,
    paddingVertical: 12,
    paddingBottom: Platform.OS === 'ios' ? 16 : 12,
    backgroundColor: Colors.bluejeansLight,
    borderTopWidth: 1,
    borderTopColor: 'rgba(255, 255, 255, 0.2)',
  },
  sendButton: {
    backgroundColor: Colors.actionColor,
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 5,
  },
  sendButtonPressed: {
    backgroundColor: '#e6eb5c',
  },
  sendButtonDisabled: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
    shadowOpacity: 0,
    elevation: 0,
  },
  sendButtonText: {
    color: Colors.darkGrayDark,
    fontSize: 18,
    fontWeight: 'bold',
  },
  sendButtonTextDisabled: {
    color: 'rgba(255, 255, 255, 0.5)',
  },
  loadingContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  loadingText: {
    color: Colors.darkGrayDark,
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },

  // Bottom spacer
  bottomSpacer: {
    height: 100,
  },
});
