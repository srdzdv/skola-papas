import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import { trackEvent } from "@aptabase/react-native";
var Parse = require('parse/react-native');
import { getSignedObjectUrl, getOLDS3SignedUrl } from '../s3API';
import dayjs from '../utils/dayjs';
import Colors from '../constants/Colors';
import Constants from '../constants/Constants';
import NetworkState from '../components/Network.js';
import TelegramService from '../TelegramService.js';
import * as Linking from 'expo-linking'
import * as Notifications from 'expo-notifications'
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as RootNavigation from '../navigation/RootNavigation';
import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import { Image as ExpoImage } from 'expo-image';
import {
  Platform,
  StyleSheet,
  Text,
  Pressable,
  View,
  Image,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  DeviceEventEmitter,
  AppState,
  Modal,
  TextInput,
  KeyboardAvoidingView
} from 'react-native';

// Query limit for Anuncios, AnuncioPhotos, Actividad
const QUERY_LIMIT = 40;
const MIN_REFRESH_INTERVAL = 5000; // 5 seconds minimum between refreshes
const AUTO_REFRESH_INTERVAL = 60000; // 60 seconds

// Memoized list item component - pass primitives for effective memoization
const MessageItem = memo(function MessageItem({
  id,
  tipo,
  timestamp,
  autor,
  destino,
  descripcion,
  attachmentObjectId,
  attachmentIsLoading,
  attachmentThumbnailUrl,
  attachmentCount,
  attachmentType,
  isMyMessage,
  onPress,
}) {
  const handlePress = useCallback(() => {
    onPress(id);
  }, [id, onPress]);

  const hasMultipleAttachments = attachmentCount > 1;
  const isPDF = attachmentType?.toUpperCase() === 'PDF';
  const isVideo = attachmentType === 'VID';

  const hasThumbnail = attachmentObjectId.length > 0 && !isPDF && !isVideo;

  const renderPDFBadge = () => (
    <View style={[
      styles.attachmentBadgeContainer,
      isMyMessage ? styles.myThumbnailContainer : styles.otherThumbnailContainer
    ]}>
      <Text style={styles.pdfBadgeText}>PDF</Text>
    </View>
  );

  const renderVideoBadge = () => (
    <View style={[
      styles.attachmentBadgeContainer,
      isMyMessage ? styles.myThumbnailContainer : styles.otherThumbnailContainer
    ]}>
      <Ionicons name="videocam" size={24} color={Colors.lavanderDark} />
    </View>
  );

  const renderThumbnail = () => (
    <View style={[
      styles.thumbnailContainer,
      isMyMessage ? styles.myThumbnailContainer : styles.otherThumbnailContainer
    ]}>
      {attachmentThumbnailUrl.length > 0 ? (
        <ExpoImage
          style={styles.attachmentThumbnail}
          source={{ uri: attachmentThumbnailUrl }}
          contentFit="cover"
          transition={200}
          cachePolicy="memory-disk"
          recyclingKey={`thumb-${id}`}
        />
      ) : attachmentIsLoading ? (
        <View style={styles.thumbnailLoadingContainer}>
          <ActivityIndicator size="small" color={Colors.darkGrayLight} />
        </View>
      ) : null}
    </View>
  );

  return (
    <Pressable onPress={handlePress}>
      <View style={[
        styles.messageRow,
        isMyMessage ? styles.myMessageRow : styles.otherMessageRow
      ]}>
        {/* Thumbnail on left for my messages */}
        {isMyMessage && hasThumbnail && renderThumbnail()}
        {isMyMessage && isPDF && renderPDFBadge()}
        {isMyMessage && isVideo && renderVideoBadge()}

        <View style={[
          styles.messageContainer,
          isMyMessage ? styles.myMessage : styles.otherMessage
        ]}>
          <Text style={[
            styles.messageText,
            isMyMessage ? styles.myMessageText : styles.otherMessageText
          ]}>{descripcion}</Text>
          <View style={styles.messageDetails}>
            <Text style={[
              styles.detailText,
              isMyMessage ? styles.myDetailText : styles.otherDetailText
            ]}>{timestamp}</Text>
            <Text style={[
              styles.detailText,
              isMyMessage ? styles.myDetailText : styles.otherDetailText
            ]}>{autor}</Text>
            {attachmentObjectId.length > 0 && (
              <View style={styles.attachmentIconContainer}>
                <Image
                  style={styles.attachmentIcon}
                  source={isMyMessage
                    ? require('../assets/images/attachmentIconWhite.png')
                    : require('../assets/images/attachmentIconBlack.png')}
                />
                {hasMultipleAttachments && (
                  <View style={[
                    styles.attachmentCountBadge,
                    isMyMessage ? styles.myAttachmentCountBadge : styles.otherAttachmentCountBadge
                  ]}>
                    <Text style={[
                      styles.attachmentCountText,
                      isMyMessage ? styles.myAttachmentCountText : styles.otherAttachmentCountText
                    ]}>{attachmentCount}</Text>
                  </View>
                )}
                {attachmentIsLoading && (
                  <ActivityIndicator
                    size="small"
                    color={isMyMessage ? Colors.lavanderDarker : Colors.darkGrayLight}
                    style={styles.attachmentLoadingIndicator}
                  />
                )}
              </View>
            )}
            <Ionicons
              name="chevron-forward"
              size={16}
              color={isMyMessage ? Colors.lavanderDarker : Colors.darkGrayLight}
              style={styles.chevronIcon}
            />
          </View>
        </View>

        {/* Thumbnail on right for other messages */}
        {!isMyMessage && hasThumbnail && renderThumbnail()}
        {!isMyMessage && isPDF && renderPDFBadge()}
        {!isMyMessage && isVideo && renderVideoBadge()}
      </View>
    </Pressable>
  );
});

export default function ComunicacionScreen() {
  // State
  const [originalData, setOriginalData] = useState([]);
  const [data, setData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [multiChildren, setMultiChildren] = useState(false);
  const [tareaFilterActive, setTareaFilterActive] = useState(false);
  const [momentosFilterActive, setMomentosFilterActive] = useState(false);
  const [anunciosFilterActive, setAnunciosFilterActive] = useState(false);
  const [hasData, setHasData] = useState(true);
  const [hasPagoPendiente, setHasPagoPendiente] = useState(false);
  const [flatListIsRefreshing, setFlatListIsRefreshing] = useState(false);
  const [studentHasPlaneacion, setStudentHasPlaneacion] = useState(false);
  const [lastRefreshTime, setLastRefreshTime] = useState(null);
  const [showSuggestionModal, setShowSuggestionModal] = useState(false);
  const [suggestionText, setSuggestionText] = useState('');
  const [isSubmittingSuggestion, setIsSubmittingSuggestion] = useState(false);
  const [currentEstudiante, setCurrentEstudiante] = useState(null);
  const [currentEstudianteNombre, setCurrentEstudianteNombre] = useState('');
  const [estudiantesArr, setEstudiantesArr] = useState([]);

  // Refs
  const currentUserRef = useRef(new Parse.User());
  const escuelaNombreRef = useRef("");
  const escuelaTelefonoRef = useRef("");
  const escuelaObjIdRef = useRef("");
  const refreshIntervalRef = useRef(null);
  const refreshAnuncioListRef = useRef(null);
  const notificationSubscriptionRef = useRef(null);
  const appStateSubscriptionRef = useRef(null);

  // Navigation options
  ComunicacionScreen.navigationOptions = {
    header: null,
  };

  // Notification handler
  const handleNotification = useCallback((notification) => {
    if (notification.request.content.data) {
      const notifData = notification.request.content.data;
      const screen = notifData.screen;
      const objectId = notifData.objectId;

      switch(screen) {
        case "anuncio":
          const currentRoute = RootNavigation.getCurrentRoute();
          if (currentRoute === 'Home' || currentRoute === 'Comunicacion' || currentRoute === 'Inicio') {
            refreshAnuncioList();
          } else {
            RootNavigation.navigate("AnuncioDetail", {deepObjId: objectId});
          }
          break;
        case "servicioSolicitado":
          setNavigationAsyncStorage("servicio");
          RootNavigation.navigate("AdminStack");
          break;
        case "informacion":
          setNavigationAsyncStorage(objectId);
          RootNavigation.navigate("InformacionStack");
          break;
        case "pago":
          setNavigationAsyncStorage("pago");
          RootNavigation.navigate("AdminStack");
          break;
        case "acceso":
          setNavigationAsyncStorage("acceso");
          RootNavigation.navigate("AdminStack");
          break;
        case "factura":
          setNavigationAsyncStorage("factura");
          RootNavigation.navigate("AdminStack");
          break;
        case "planeacion":
          RootNavigation.navigate("PlaneacionList", {estudianteObjId: currentEstudiante});
          break;
        case "evento":
          setNavigationAsyncStorage(objectId);
          RootNavigation.navigate("EventosStack");
          break;
        default:
          break;
      }
    }
  }, [currentEstudiante]);

  // App state change handler
  const handleAppStateChange = useCallback((nextAppState) => {
    if (nextAppState === 'active') {
      const now = Date.now();
      if (!lastRefreshTime || (now - lastRefreshTime) > AUTO_REFRESH_INTERVAL) {
        refreshAnuncioList();
      }
    }
  }, [lastRefreshTime]);

  // Load data once on mount
  useEffect(() => {
    checkNetworkStatus();
  }, []);

  // Keep listeners up to date with latest callbacks
  useEffect(() => {
    notificationSubscriptionRef.current?.remove();
    notificationSubscriptionRef.current = Notifications.addNotificationReceivedListener(handleNotification);
  }, [handleNotification]);

  useEffect(() => {
    appStateSubscriptionRef.current?.remove();
    appStateSubscriptionRef.current = AppState.addEventListener('change', handleAppStateChange);
  }, [handleAppStateChange]);

  // Keep refresh ref current
  useEffect(() => {
    refreshAnuncioListRef.current = refreshAnuncioList;
  }, [refreshAnuncioList]);

  // Set up periodic refresh and event listener on mount
  useEffect(() => {
    const eventEmitterSubscription = DeviceEventEmitter.addListener("refreshAnuncioList", () => {
      refreshAnuncioListRef.current?.();
    });

    refreshIntervalRef.current = setInterval(() => {
      refreshAnuncioListRef.current?.();
    }, AUTO_REFRESH_INTERVAL);

    return () => {
      if (refreshIntervalRef.current) {
        clearInterval(refreshIntervalRef.current);
      }
      eventEmitterSubscription.remove();
      appStateSubscriptionRef.current?.remove();
      notificationSubscriptionRef.current?.remove();
    };
  }, []);

  // Async storage helper
  const setNavigationAsyncStorage = async (deepObjId) => {
    try {
      await AsyncStorage.setItem('deepObjId', deepObjId);
    } catch (error) {
      console.log("Error setNavigationAsyncStorage: " + JSON.stringify(error));
    }
  };

  const checkNetworkStatus = () => {
    const networkStateIsConnected = NetworkState.checkNetworkState();
    if (networkStateIsConnected) {
      runInitNetworkMethods();
    } else {
      presentFeedback(Constants.noNetworkConexionAlertTitle, Constants.noNetworkConexionAlertMessage);
    }
  };

  const runInitNetworkMethods = () => {
    Parse.User.currentAsync().then((user) => {
      currentUserRef.current = user;
      const escuela = user.get('escuela');
      getUserEscuela(escuela.id);
      getUserEstudiantes();
      // checkSuggestionBoxTiming(); // Disabling for now
    });
  };

  const checkSuggestionBoxTiming = async () => {
    try {
      const lastShown = await AsyncStorage.getItem('lastSuggestionBoxShown');
      const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
      const oneDayMs = 24 * 60 * 60 * 1000;

      if (!lastShown) {
        const firstShownKey = 'suggestionBoxFirstShown';
        const firstShown = await AsyncStorage.getItem(firstShownKey);

        if (!firstShown) {
          await AsyncStorage.setItem(firstShownKey, Date.now().toString());
        } else {
          const timeSinceFirstShown = Date.now() - parseInt(firstShown);
          if (timeSinceFirstShown >= oneDayMs) {
            setTimeout(() => setShowSuggestionModal(true), 2000);
          }
        }
      } else if ((Date.now() - parseInt(lastShown)) > thirtyDaysMs) {
        setTimeout(() => setShowSuggestionModal(true), 2000);
      }
    } catch (error) {
      console.log("Error checking suggestion box timing: " + JSON.stringify(error));
    }
  };

  const submitSuggestion = async () => {
    if (!suggestionText.trim()) {
      dismissSuggestionModal();
      return;
    }

    setIsSubmittingSuggestion(true);

    try {
      const SuggestionFeedback = Parse.Object.extend("SuggestionFeedback");
      const feedback = new SuggestionFeedback();

      feedback.set("userId", currentUserRef.current);
      feedback.set("escuelaId", currentUserRef.current.get('escuela'));
      feedback.set("feedback", suggestionText.trim());

      await feedback.save();
      await AsyncStorage.setItem('lastSuggestionBoxShown', Date.now().toString());

      const escuelaId = currentUserRef.current.get('escuela').id;
      TelegramService.sendSuggestionFeedback(
        suggestionText.trim(),
        currentUserRef.current.id,
        escuelaId,
        escuelaNombreRef.current
      ).catch((error) => {
        console.log("Error sending Telegram notification:", error);
      });

      trackEvent("suggestion_submitted", {
        escuela: escuelaObjIdRef.current,
        userId: currentUserRef.current.id,
      });

      setShowSuggestionModal(false);
      setSuggestionText('');
      setIsSubmittingSuggestion(false);

      presentFeedback("Gracias!", "Tu sugerencia ha sido enviada. Apreciamos tu retroalimentacion.");
    } catch (error) {
      console.log("Error submitting suggestion: " + JSON.stringify(error));
      setIsSubmittingSuggestion(false);
      presentFeedback("Error", "No pudimos enviar tu sugerencia. Intenta de nuevo, por favor.");
    }
  };

  const dismissSuggestionModal = async () => {
    try {
      await AsyncStorage.setItem('lastSuggestionBoxShown', Date.now().toString());
    } catch (error) {
      console.log("Error saving suggestion dismiss timestamp: " + JSON.stringify(error));
    }

    trackEvent("suggestion_dismissed", {
      escuela: escuelaObjIdRef.current,
      userId: currentUserRef.current.id,
    });

    setShowSuggestionModal(false);
    setSuggestionText('');
  };

  const handleConnectionChange = (isConnected) => {
    if (isConnected) {
      if (escuelaNombreRef.current.length === 0) {
        runInitNetworkMethods();
      }
    } else {
      presentFeedback(Constants.noNetworkConexionAlertTitle, Constants.noNetworkConexionAlertMessage);
    }
  };

  const getUserEscuela = (escuelaObjId) => {
    const Escuela = Parse.Object.extend("Escuela");
    const query = new Parse.Query(Escuela);
    query.get(escuelaObjId)
      .then((escuelaFetched) => {
        escuelaObjIdRef.current = escuelaObjId;
        escuelaNombreRef.current = escuelaFetched.get('nombre');
        escuelaTelefonoRef.current = escuelaFetched.get('telefono');
      }, (error) => {
        presentFeedback("Mensajes vacios", "Algo inesperado al intentar buscar tus mensajes. Intenta de nuevo, por favor.");
      });
  };

  const getUserEstudiantes = async () => {
    const Estudiantes = Parse.Object.extend("Estudiantes");
    const query = new Parse.Query(Estudiantes);
    query.equalTo("PersonasAutorizadas", currentUserRef.current);
    query.equalTo("status", 0);
    query.include("grupo");
    try {
      const results = await query.find();
      const isMultiChildren = results.length > 1;
      registerExpoPushTokenForEstudiantes(results);
      setCurrentEstudianteState(results, isMultiChildren);

      const estudianteObjIdArr = [];
      const grupoIdsArr = [];
      for (let i = 0; i < results.length; i++) {
        const estudianteObj = results[i];
        estudianteObjIdArr.push(estudianteObj.id);
        const grupoId = estudianteObj.get("grupo").id;
        grupoIdsArr.push(grupoId);
      }
      syncEstudianteIDsForUser(estudianteObjIdArr);
      syncGruposForUser(grupoIdsArr);

      const firstEstudianteArr = [results[0]];
      getEstudiantesAnuncios(firstEstudianteArr);
      countPlaneacionForCurrentEstudiante(results[0]);
    } catch (error) {
      presentFeedback("Mensajes vacio", "Hubo un problema al intentar buscar tus mensajes. Intenta de nuevo, por favor.");
    }
  };

  const registerExpoPushTokenForEstudiantes = async (results) => {
    try {
      const expoPushToken = await AsyncStorage.getItem('expoPushToken');
      if (expoPushToken !== null) {
        for (let i = 0; i < results.length; i++) {
          const estudianteObj = results[i];
          let tokensArr = [];
          if (estudianteObj.get('expoPushToken')) {
            tokensArr = estudianteObj.get('expoPushToken');
            if (!tokensArr.includes(expoPushToken)) {
              tokensArr.push(expoPushToken);
            } else {
              continue;
            }
          } else {
            tokensArr.push(expoPushToken);
          }
          estudianteObj.set("expoPushToken", tokensArr);
          estudianteObj.save();
        }
      }
    } catch (error) {
      // Error retrieving data
    }
  };

  const refreshAnuncioList = useCallback(() => {
    if (isLoading) {
      return;
    }

    const now = Date.now();
    if (lastRefreshTime && (now - lastRefreshTime) < MIN_REFRESH_INTERVAL) {
      return;
    }

    setLastRefreshTime(now);

    if (estudiantesArr.length > 0) {
      getEstudiantesAnuncios(estudiantesArr, true);
    }
  }, [isLoading, lastRefreshTime, estudiantesArr]);

  const getEstudiantesAnuncios = async (estudiantesArrParam, isRefresh = false) => {
    // Only show loading indicator and clear data on initial load, not on refresh
    if (!isRefresh) {
      setIsLoading(true);
      setData([]);
    }

    const gruposArr = [];
    const estudianteObjIdArr = [];

    for (let i = 0; i < estudiantesArrParam.length; i++) {
      const estudianteObj = estudiantesArrParam[i];
      estudianteObjIdArr.push(estudianteObj.id);
      const grupo = estudianteObj.get('grupo');
      gruposArr.push(grupo);
    }

    const Anuncio = Parse.Object.extend("anuncio");
    const queryGrupo = new Parse.Query(Anuncio);
    queryGrupo.containedIn('grupos', gruposArr);

    const queryEstudiante = new Parse.Query(Anuncio);
    queryEstudiante.containedIn("estudiante", estudiantesArrParam);

    const mainQuery = Parse.Query.or(queryEstudiante, queryGrupo);
    mainQuery.equalTo("aprobado", true);
    mainQuery.include("autor");
    mainQuery.include('estudiante');
    mainQuery.include('tipo');
    mainQuery.include('grupos');
    mainQuery.descending("createdAt");
    mainQuery.limit(QUERY_LIMIT);

    try {
      const results = await mainQuery.find();

      if (results.length === 0) {
        setHasData(false);
        setIsLoading(false);
        setFlatListIsRefreshing(false);
        return;
      } else {
        setHasData(true);
      }

      const estudiantesArrData = [];

      for (let i = 0; i < results.length; i++) {
        const object = results[i];

        let tipo = "Mensaje";
        if (object.get('tipo') != null) {
          tipo = object.get('tipo').get('nombre');
        }

        const timestamp = dayjs(object.createdAt).format("dd DD/MMM");
        let autor = "";
        let autorObj = null;
        if (object.get('autor')) {
          autorObj = object.get('autor');
          const usertype = autorObj.get('usertype');
          if (usertype === 2) {
            autor = autorObj.get('parentesco');
          } else {
            autor = autorObj.get('username');
          }
        }

        let destino = "";
        if (object.get('estudiante') != null) {
          destino = object.get('estudiante').get('NOMBRE');
        } else if (object.get('grupos') != null) {
          const grupos = object.get('grupos');
          if (grupos.length > 6) {
            destino = "Toda la escuela.";
          } else {
            for (let j = 0; j < grupos.length; j++) {
              const grupo = grupos[j];
              if (grupo != null) {
                if (grupo.get('grupoId')) {
                  const grupoId = grupo.get('grupoId');
                  if (j === grupos.length - 1) {
                    destino = destino + grupoId + ".";
                  } else {
                    destino = destino + grupoId + ", ";
                  }
                }
              }
            }
          }
        }

        let descripcion = "";
        if (object.get('momento') != null) {
          tipo = "Momentos";
          const momentosData = object.get('momento');
          let comentariosString = "";
          if (momentosData["alimentosComentarios"]) {
            comentariosString = momentosData["alimentosComentarios"];
          }
          descripcion = "Momentos del Dia\n\nComentarios: " + comentariosString;
        } else if (object.get('descripcion')) {
          descripcion = object.get('descripcion');
        }

        if (descripcion.length > 100) {
          descripcion = descripcion.substring(0, 100);
          if (descripcion.includes("\n")) {
            descripcion = descripcion.replace("\n", " ");
          }
          descripcion = descripcion + "...";
        }

        const itemData = {
          id: object.id,
          tipo: tipo,
          timestamp: timestamp,
          autor: autor,
          autorObj: autorObj,
          destino: destino,
          descripcion: descripcion,
          attachment: {
            objectId: "",
            tipo: "",
            isNewBucket: false,
            thumbnailUrl: "",
            fullSizeUrl: "",
            isLoading: false,
            count: 0
          },
          anuncioSeen: true
        };

        estudiantesArrData.push(itemData);
      }

      // Update UI immediately with text content
      setIsLoading(false);
      setData(estudiantesArrData);
      if (originalData.length === 0) {
        setOriginalData(estudiantesArrData);
      }
      setFlatListIsRefreshing(false);

      // Load supplementary data in background
      loadSupplementaryData(mainQuery, estudiantesArrData);
      checkForPendingPayments();

    } catch (error) {
      setIsLoading(false);
      presentFeedback("Mensajes vacio", "Hubo un problema al intentar buscar tus mensajes. Intenta de nuevo, por favor.");
    }
  };

  const loadSupplementaryData = async (mainQuery, dataArray) => {
    try {
      const [resultAnuncioPhoto, resultActividad] = await Promise.all([
        getAnuncioPhotos(mainQuery),
        getActividadData(mainQuery)
      ]);

      const updatedData = dataArray.map((item) => {
        const attachmentData = lookForAttachmentInAnuncioPhotoTable(item.id, [...resultAnuncioPhoto]);
        const anuncioSeenBool = checkIfAnuncioSeen(item.id, item.autorObj, [...resultActividad]);

        return {
          ...item,
          attachment: {
            ...attachmentData,
            thumbnailUrl: "",
            fullSizeUrl: "",
            isLoading: attachmentData.objectId.length > 0,
            count: attachmentData.count
          },
          anuncioSeen: anuncioSeenBool
        };
      });

      setData(updatedData);
      if (originalData.length === 0) {
        setOriginalData(updatedData);
      }

      loadAttachmentImages(updatedData);
    } catch (error) {
      console.log("Error loading supplementary data:", error);
    }
  };

  const checkIfAnuncioSeen = (anuncioId, autorObj, resultActividad) => {
    if (autorObj && autorObj.id === currentUserRef.current.id) {
      return true;
    }

    for (let i = 0; i < resultActividad.length; i++) {
      const object = resultActividad[i];
      const anuncioActObj = object.get('anuncioID');
      if (anuncioActObj && anuncioActObj.id === anuncioId) {
        return true;
      }
    }

    return false;
  };

  const getAnuncioPhotos = async (mainQuery) => {
    const AnuncioPhoto = Parse.Object.extend("AnuncioPhoto");
    const anuncioPhotoQuery = new Parse.Query(AnuncioPhoto);
    anuncioPhotoQuery.matchesQuery("anuncio", mainQuery);
    anuncioPhotoQuery.descending("createdAt");
    anuncioPhotoQuery.limit(QUERY_LIMIT);
    return await anuncioPhotoQuery.find();
  };

  const getActividadData = async (mainQuery) => {
    const Actividad = Parse.Object.extend("actividad");
    const queryActividad = new Parse.Query(Actividad);
    queryActividad.matchesQuery("anuncioID", mainQuery);
    queryActividad.equalTo("userID", currentUserRef.current);
    queryActividad.descending("createdAt");
    queryActividad.limit(QUERY_LIMIT);
    return await queryActividad.find();
  };

  const loadAttachmentImages = async (dataArray) => {
    const itemsWithAttachments = dataArray.filter(item => item.attachment.objectId.length > 0);

    const imagePromises = itemsWithAttachments
      .map(async (item) => {
        try {
          const isNewBucket = item.attachment.isNewBucket === true;

          const [thumbnailUrl, fullSizeUrl] = await Promise.all([
            fetchThumbnailForAttachment(item.attachment.objectId, isNewBucket),
            fetchFullSizeAttachment(item.attachment.objectId, isNewBucket)
          ]);

          updateItemAttachment(item.id, {
            thumbnailUrl,
            fullSizeUrl,
            isLoading: false
          });
        } catch (error) {
          console.log("Error loading attachment for item:", item.id, error);
          updateItemAttachment(item.id, { isLoading: false });
        }
      });

    await Promise.allSettled(imagePromises);
  };

  const updateItemAttachment = (itemId, attachmentUpdate) => {
    setData(prevData =>
      prevData.map(item =>
        item.id === itemId
          ? { ...item, attachment: { ...item.attachment, ...attachmentUpdate } }
          : item
      )
    );

    setOriginalData(prevData =>
      prevData.map(item =>
        item.id === itemId
          ? { ...item, attachment: { ...item.attachment, ...attachmentUpdate } }
          : item
      )
    );
  };

  const fetchThumbnailForAttachment = async (attachmentObjId, isNewBucket) => {
    const resizedPrefix = "resized-" + attachmentObjId;
    if (isNewBucket) {
      return await getSignedObjectUrl(resizedPrefix);
    }
    return await getOLDS3SignedUrl(resizedPrefix);
  };

  const fetchFullSizeAttachment = async (attachmentObjId, isNewBucket) => {
    if (isNewBucket) {
      return await getSignedObjectUrl(attachmentObjId);
    }
    return await getOLDS3SignedUrl(attachmentObjId);
  };

  const checkForPendingPayments = async () => {
    const todayDayNumber = dayjs().date();
    const bbSubstr = escuelaNombreRef.current.substring(0, 11);
    if (bbSubstr === "BabyBoomers" && todayDayNumber > 5) {
      const Pago = Parse.Object.extend("pagos");
      const pagosQuery = new Parse.Query(Pago);
      pagosQuery.equalTo("pagado", false);
      pagosQuery.equalTo("recurrente", false);
      pagosQuery.containedIn("student", estudiantesArr);
      pagosQuery.limit(40);
      try {
        const count = await pagosQuery.count();
        if (count > 0) {
          let alertTituloStr = "";
          let alertMensajeStr = "";
          if (count === 1) {
            alertTituloStr = "Pago pendiente";
            alertMensajeStr = "Tienes un pago pendiente en tu estado de cuenta. Ingresa a Administracion para consolidar el pago, por favor.";
          } else {
            alertTituloStr = "Pagos pendientes";
            alertMensajeStr = "Tienes " + count + " pagos pendientes en tu estado de cuenta. Ingresa a Administracion para consolidar los pagos, por favor.";
          }
          setHasPagoPendiente(true);
          presentFeedback(alertTituloStr, alertMensajeStr);
        } else {
          setHasPagoPendiente(false);
        }
      } catch (error) {
        console.log("checkForPendingPayments ERROR: " + JSON.stringify(error));
      }
    }
  };

  const lookForAttachmentInAnuncioPhotoTable = (anuncioObjId, resultAnuncioPhoto) => {
    let adjuntoData = {
      objectId: "",
      tipo: "",
      isNewBucket: false,
      thumbnailUrl: "",
      fullSizeUrl: "",
      count: 0
    };

    // First, count all attachments for this anuncio
    let count = 0;
    let firstAttachmentIndex = -1;
    for (let i = 0; i < resultAnuncioPhoto.length; i++) {
      const object = resultAnuncioPhoto[i];
      const anuncioInPhoto = object.get('anuncio');
      if (anuncioInPhoto.id === anuncioObjId) {
        count++;
        if (firstAttachmentIndex === -1) {
          firstAttachmentIndex = i;
        }
      }
    }

    // Get the first attachment's data
    if (firstAttachmentIndex !== -1) {
      const object = resultAnuncioPhoto[firstAttachmentIndex];
      const tipoAdjunto = object.get('TipoArchivo');
      const isNewBucket = object.get("newS3Bucket");
      adjuntoData = {
        objectId: object.id,
        tipo: tipoAdjunto,
        isNewBucket: isNewBucket,
        thumbnailUrl: "",
        fullSizeUrl: "",
        count: count
      };
    }

    return adjuntoData;
  };

  const setCurrentEstudianteState = (estudiantesArrParam, isMultiChildren) => {
    const estudianteObjId = estudiantesArrParam[0].id;
    const estudianteNombre = estudiantesArrParam[0].get("NOMBRE");

    setCurrentEstudiante(estudianteObjId);
    setCurrentEstudianteNombre(estudianteNombre);
    setMultiChildren(isMultiChildren);
    setEstudiantesArr(estudiantesArrParam);
    setCurrentEstudianteInAsyncStorage(estudianteObjId);
  };

  const setCurrentEstudianteInAsyncStorage = async (estudianteObjId) => {
    try {
      await AsyncStorage.setItem('currentEstudianteID', estudianteObjId);
    } catch (error) {
      // Error saving data
    }
  };

  const syncEstudianteIDsForUser = async (estudianteObjIdArr) => {
    const estudianteIDsString = estudianteObjIdArr.join(",");
    try {
      await AsyncStorage.setItem('userEstudianteIDs', estudianteIDsString);
    } catch (error) {
      console.log("Error_AsyncStorage syncEstudianteIDsForUser: " + JSON.stringify(error));
    }
  };

  const syncGruposForUser = async (gruposIdsArr) => {
    const gruposIDsString = gruposIdsArr.join(",");
    try {
      await AsyncStorage.setItem('userGrupos', gruposIDsString);
    } catch (error) {
      console.log("Error_AsyncStorage userGrupos: " + JSON.stringify(error));
    }
  };

  const changeEstudianteBtnPressed = useCallback(() => {
    if (multiChildren) {
      const alertDataArr = [];
      for (let i = 0; i < estudiantesArr.length; i++) {
        const estudianteObj = estudiantesArr[i];
        const estudianteNombre = estudianteObj.get('NOMBRE');
        const alertAction = {
          text: estudianteNombre,
          onPress: () => changeToSelectedStudent(estudianteObj),
          style: 'default'
        };
        alertDataArr.push(alertAction);
      }
      const cancelAction = {text: 'Cancelar', onPress: null, style: 'cancel'};
      alertDataArr.push(cancelAction);

      Alert.alert(
        "Cambio de alumno",
        "Selecciona un alumno de la lista para ver sus mensajes.",
        alertDataArr
      );
    }
  }, [multiChildren, estudiantesArr]);

  const changeToSelectedStudent = (estudianteObj) => {
    const estudianteNombre = estudianteObj.get('NOMBRE');
    const estudianteArr = [estudianteObj];
    setCurrentEstudiante(estudianteObj.id);
    setCurrentEstudianteNombre(estudianteNombre);
    setOriginalData([]);
    setCurrentEstudianteInAsyncStorage(estudianteObj.id);
    getEstudiantesAnuncios(estudianteArr);
    countPlaneacionForCurrentEstudiante(estudianteObj);
  };

  const countPlaneacionForCurrentEstudiante = async (estudianteObj) => {
    const grupoObj = estudianteObj.get('grupo');
    const Planeacion = Parse.Object.extend("Planeacion");
    const query = new Parse.Query(Planeacion);
    query.equalTo("grupo", grupoObj);
    query.greaterThanOrEqualTo("fecha", dayjs().day(1).startOf('day').toDate());
    query.lessThanOrEqualTo("fecha", dayjs().day(6).startOf('day').toDate());
    query.ascending('createdAt');
    const count = await query.count();
    setStudentHasPlaneacion(count > 0);
  };

  const filterDataList = useCallback((tipoFilter) => {
    let filtroArr = [];

    if (tipoFilter === "Momentos") {
      if (momentosFilterActive) {
        filtroArr = originalData;
      } else {
        filtroArr = originalData.filter(anuncio => anuncio.tipo === "Momentos");
      }
      setData(filtroArr);
      setTareaFilterActive(false);
      setMomentosFilterActive(!momentosFilterActive);
      setAnunciosFilterActive(false);
    } else if (tipoFilter === "Tarea") {
      if (tareaFilterActive) {
        filtroArr = originalData;
      } else {
        filtroArr = originalData.filter(anuncio => anuncio.tipo === "Tarea");
      }
      setData(filtroArr);
      setTareaFilterActive(!tareaFilterActive);
      setMomentosFilterActive(false);
      setAnunciosFilterActive(false);
    } else if (tipoFilter === "Anuncios") {
      if (anunciosFilterActive) {
        filtroArr = originalData;
      } else {
        filtroArr = originalData.filter(anuncio => anuncio.tipo === "Mensaje" || anuncio.tipo === "Anuncio");
      }
      setData(filtroArr);
      setTareaFilterActive(false);
      setMomentosFilterActive(false);
      setAnunciosFilterActive(!anunciosFilterActive);
    }
  }, [originalData, momentosFilterActive, tareaFilterActive, anunciosFilterActive]);

  const goToPlaneacion = useCallback(() => {
    RootNavigation.navigate("PlaneacionList", {estudianteObjId: currentEstudiante});
  }, [currentEstudiante]);

  const escribirBtnPressed = useCallback(() => {
    RootNavigation.navigate('Escribir', {currentEstudiante: currentEstudiante});
  }, [currentEstudiante]);

  const llamarBtnPressed = useCallback(() => {
    const linkingString = "tel:" + escuelaTelefonoRef.current;
    Linking.openURL(linkingString);
  }, []);

  const pagoPendienteBannerOnPress = useCallback(() => {
    RootNavigation.navigate('AdminStack');
  }, []);

  // Stable callback for list item press - hoisted to root
  const handleItemPress = useCallback((itemId) => {
    const item = data.find(d => d.id === itemId);
    if (item) {
      trackEvent("anuncio_open", {
        escuela: escuelaObjIdRef.current,
      });
      RootNavigation.navigate('AnuncioDetail', {anuncioObj: item});
    }
  }, [data]);

  const refreshFlatList = useCallback(() => {
    setFlatListIsRefreshing(true);
    refreshAnuncioList();
  }, [refreshAnuncioList]);

  const presentFeedback = (alertTitle, alertMessage) => {
    Alert.alert(
      alertTitle,
      alertMessage,
      [{text: 'Ok', onPress: null, style: 'default'}],
      {cancelable: false},
    );
  };

  // Memoized renderItem function
  const renderItem = useCallback(({ item }) => {
    const isMyMessage = item.autorObj && item.autorObj.id === currentUserRef.current.id;

    return (
      <MessageItem
        id={item.id}
        tipo={item.tipo}
        timestamp={item.timestamp}
        autor={item.autor}
        destino={item.destino}
        descripcion={item.descripcion}
        attachmentObjectId={item.attachment.objectId}
        attachmentIsLoading={item.attachment.isLoading}
        attachmentThumbnailUrl={item.attachment.thumbnailUrl}
        attachmentCount={item.attachment.count}
        attachmentType={item.attachment.tipo}
        isMyMessage={isMyMessage}
        onPress={handleItemPress}
      />
    );
  }, [handleItemPress]);

  // Stable keyExtractor using unique ID instead of index
  const keyExtractor = useCallback((item) => item.id, []);

  // Filter handlers with stable references
  const handleTareaFilter = useCallback(() => filterDataList("Tarea"), [filterDataList]);
  const handleMomentosFilter = useCallback(() => filterDataList("Momentos"), [filterDataList]);
  const handleAnunciosFilter = useCallback(() => filterDataList("Anuncios"), [filterDataList]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          {isLoading ? (
            <ActivityIndicator size="small" color="#ffff" animating={isLoading} style={styles.headerLoading} hidesWhenStopped={true}/>
          ) : (
            <Text style={styles.headerTitle}>{escuelaNombreRef.current}</Text>
          )}
        </View>
        {hasPagoPendiente && (
          <View style={styles.pagoPendienteBanner}>
            <Pressable onPress={pagoPendienteBannerOnPress}>
              <Text style={styles.pagoPendienteBannerText}>Estado de cuenta con pago pendiente!</Text>
            </Pressable>
          </View>
        )}

        <View style={styles.subheader}>
          <Pressable onPress={llamarBtnPressed}>
            <Text style={styles.subheaderTitle}>Llamar</Text>
          </Pressable>
          <Pressable onPress={changeEstudianteBtnPressed}>
            <View style={styles.estudianteContainer}>
              <Text style={styles.subheaderEstudiante}>{currentEstudianteNombre}</Text>
              {multiChildren && (
                <Image style={styles.attachmentImage} source={require('../assets/images/groupIcon.png')} />
              )}
            </View>
          </Pressable>
          <Pressable onPress={escribirBtnPressed}>
            <Text style={styles.subheaderTitle}>Escribir</Text>
          </Pressable>
        </View>

        <View style={styles.optionsHeader}>
          <Pressable
            onPress={handleTareaFilter}
            style={[styles.optionButton, tareaFilterActive && styles.activeOptionButton]}
          >
            <Text style={[styles.optionButtonText, tareaFilterActive && styles.activeOptionButtonText]}>Tareas</Text>
          </Pressable>
          <Pressable
            onPress={handleMomentosFilter}
            style={[styles.optionButton, momentosFilterActive && styles.activeOptionButton]}
          >
            <Text style={[styles.optionButtonText, momentosFilterActive && styles.activeOptionButtonText]}>Momentos</Text>
          </Pressable>
          <Pressable
            onPress={handleAnunciosFilter}
            style={[styles.optionButton, anunciosFilterActive && styles.activeOptionButton]}
          >
            <Text style={[styles.optionButtonText, anunciosFilterActive && styles.activeOptionButtonText]}>Anuncios</Text>
          </Pressable>
          <Pressable
            onPress={goToPlaneacion}
            style={[styles.optionButton, studentHasPlaneacion && styles.activeOptionButton]}
          >
            <Text style={[styles.optionButtonText, studentHasPlaneacion && styles.activeOptionButtonText]}>Planeacion</Text>
          </Pressable>
        </View>

        {hasData ? (
          <FlashList
            data={data}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            estimatedItemSize={100}
            refreshing={flatListIsRefreshing}
            onRefresh={refreshFlatList}
            contentContainerStyle={styles.flatlistContent}
          />
        ) : (
          <View style={styles.emptyStateView}>
            <Text style={styles.emptyStateText}>Aqui van a aparecer mensajes de tu Escuela y mensajes que tu envies. Por ahora no hay mensajes.</Text>
            <Image source={require('../assets/images/kido.png')} style={styles.emptyStateLogoImg} />
          </View>
        )}
      </View>

      {/* Suggestion Box Modal */}
      <Modal
        visible={showSuggestionModal}
        animationType="slide"
        transparent={true}
        onRequestClose={dismissSuggestionModal}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.suggestionModalOverlay}
        >
          <Pressable
            style={styles.suggestionModalDismissArea}
            onPress={dismissSuggestionModal}
          />
          <View style={styles.suggestionModalContainer}>
            <View style={styles.suggestionModalHeader}>
              <Text style={styles.suggestionModalTitle}>Hola, un saludo del equipo de Skola</Text>
              <Pressable onPress={dismissSuggestionModal}>
                <Ionicons name="close" size={24} color={Colors.darkGrayDark} />
              </Pressable>
            </View>
            <Text style={styles.suggestionModalSubtitle}>Que podemos mejorar en la app?</Text>
            <TextInput
              style={styles.suggestionTextInput}
              multiline={true}
              placeholder="Escribe tu sugerencia aqui..."
              placeholderTextColor={Colors.mediumGrayDark}
              value={suggestionText}
              onChangeText={setSuggestionText}
              textAlignVertical="top"
            />
            <View style={styles.suggestionButtonsContainer}>
              <Pressable
                style={styles.suggestionDismissButton}
                onPress={dismissSuggestionModal}
              >
                <Text style={styles.suggestionDismissButtonText}>Todo bien con la app Cerrar</Text>
              </Pressable>
              {isSubmittingSuggestion ? (
                <View style={styles.suggestionSubmitButton}>
                  <ActivityIndicator size="small" color="#fff" />
                </View>
              ) : (
                <Pressable
                  style={styles.suggestionSubmitButton}
                  onPress={submitSuggestion}
                >
                  <Text style={styles.suggestionSubmitButtonText}>Enviar</Text>
                </Pressable>
              )}
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.lavanderDark
  },
  container: {
    flex: 1,
    backgroundColor: Colors.pinkroseClear,
  },
  contentContainer: {
    paddingTop: 4,
  },
  header: {
    backgroundColor: Colors.lavanderDark,
    height: Platform.OS === 'ios' ? 32 : 52,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 12,
  },
  headerLoading: {
    marginTop: 2,
  },
  headerLeft: {
    width: 40,
  },
  headerTitle: {
    marginTop: Platform.OS === 'ios' ? 2 : 24,
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
    flex: 1,
    textAlign: 'center',
  },
  headerRightButton: {
    width: 40,
    height: 40,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: Platform.OS === 'ios' ? 2 : 24,
  },
  subheader: {
    backgroundColor: Colors.lavanderLight,
    paddingLeft: 8,
    paddingRight: 8,
    height: 40,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  estudianteContainer: {
    flexDirection: 'row',
  },
  optionsHeader: {
    backgroundColor: Colors.pinkroseLight,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 4,
  },
  optionButton: {
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'white',
  },
  activeOptionButton: {
    backgroundColor: Colors.lavanderDark,
  },
  optionButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
  activeOptionButtonText: {
    fontWeight: '600',
  },
  subheaderTitle: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold'
  },
  subheaderEstudiante: {
    color: 'white',
    fontSize: 20,
    marginRight: 4,
  },
  flatlistContent: {
    backgroundColor: Colors.pinkroseClear,
    padding: 10,
    paddingTop: 6,
  },
  welcomeImage: {
    width: 40,
    height: 30,
    resizeMode: 'contain',
    marginTop: 26,
  },
  item: {
    padding: -40,
    fontSize: 18,
    height: 44,
  },
  attachmentImage: {
    height: 26,
    width: 26,
    marginTop: -4
  },
  emptyStateText: {
    color: 'white',
    fontWeight: '700'
  },
  emptyStateLogoImg: {
    height: 80,
    resizeMode: 'contain',
    marginTop: 40
  },
  emptyStateView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16,
    marginTop: 32
  },
  anuncioNuevoText: {
    fontWeight: '700',
    color: Colors.bittersweetDark,
  },
  pagoPendienteBanner: {
    height: 28,
    backgroundColor: Colors.bittersweetLight,
    alignItems: 'center',
    justifyContent: 'center'
  },
  pagoPendienteBannerText: {
    fontWeight: '600',
    color: 'white'
  },
  messageRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 10,
  },
  myMessageRow: {
    justifyContent: 'flex-end',
  },
  otherMessageRow: {
    justifyContent: 'flex-start',
  },
  messageContainer: {
    maxWidth: '80%',
    borderRadius: 15,
    padding: 10,
  },
  myMessage: {
    backgroundColor: Colors.lavanderDark,
  },
  otherMessage: {
    backgroundColor: 'white',
  },
  messageText: {
    fontSize: 16,
    marginBottom: 5,
  },
  myMessageText: {
    color: 'white',
  },
  otherMessageText: {
    color: 'black',
  },
  messageDetails: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
  },
  detailText: {
    fontSize: 12,
    marginRight: 5,
  },
  myDetailText: {
    color: Colors.lavanderDarker,
  },
  otherDetailText: {
    color: Colors.darkGrayLight,
  },
  attachmentIcon: {
    height: 16,
    width: 16,
    marginRight: 5,
  },
  chevronIcon: {
    marginLeft: 5,
  },
  thumbnailContainer: {
    marginTop: 5,
    transform: [{ rotate: '10deg' }],
    backgroundColor: 'white',
    padding: 4,
    borderRadius: 4,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  myThumbnailContainer: {
    marginRight: -4,
    zIndex: 1,
  },
  otherThumbnailContainer: {
    marginLeft: -20,
    zIndex: 1,
  },
  attachmentThumbnail: {
    width: 55,
    height: 44,
    borderRadius: 2,
  },
  attachmentIconContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  attachmentCountBadge: {
    minWidth: 18,
    height: 18,
    borderRadius: 9,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 2,
    paddingHorizontal: 5,
  },
  myAttachmentCountBadge: {
    backgroundColor: 'rgba(255, 255, 255, 0.3)',
  },
  otherAttachmentCountBadge: {
    backgroundColor: Colors.lavanderDark,
  },
  attachmentCountText: {
    fontSize: 11,
    fontWeight: '700',
  },
  myAttachmentCountText: {
    color: 'white',
  },
  otherAttachmentCountText: {
    color: 'white',
  },
  attachmentLoadingIndicator: {
    marginLeft: 5,
  },
  thumbnailLoadingContainer: {
    width: 55,
    height: 44,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f0f0f0',
    borderRadius: 2,
  },
  attachmentBadgeContainer: {
    marginTop: 5,
    transform: [{ rotate: '10deg' }],
    backgroundColor: 'white',
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderRadius: 4,
    shadowColor: '#000',
    shadowOffset: {
      width: 0,
      height: 2,
    },
    shadowOpacity: 0.25,
    shadowRadius: 3.84,
    elevation: 5,
  },
  pdfBadgeText: {
    color: Colors.bittersweetDark,
    fontSize: 16,
    fontWeight: '700',
  },
  // Suggestion Modal Styles
  suggestionModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'flex-end',
  },
  suggestionModalDismissArea: {
    flex: 1,
  },
  suggestionModalContainer: {
    backgroundColor: 'white',
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: Platform.OS === 'ios' ? 40 : 20,
    minHeight: 300,
  },
  suggestionModalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  suggestionModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.lavanderDark,
    flex: 1,
    marginRight: 10,
  },
  suggestionModalSubtitle: {
    fontSize: 16,
    color: Colors.darkGrayDark,
    marginBottom: 16,
  },
  suggestionTextInput: {
    borderWidth: 1,
    borderColor: Colors.mediumGrayLight,
    borderRadius: 10,
    padding: 12,
    fontSize: 16,
    minHeight: 120,
    backgroundColor: Colors.neutral200,
    color: Colors.darkGrayDark,
  },
  suggestionButtonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  suggestionDismissButton: {
    flex: 1,
    paddingVertical: 14,
    marginRight: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.mediumGrayLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestionDismissButtonText: {
    fontSize: 14,
    fontWeight: '600',
    color: Colors.darkGrayLight,
    textAlign: 'center',
  },
  suggestionSubmitButton: {
    flex: 1,
    paddingVertical: 14,
    marginLeft: 10,
    borderRadius: 10,
    backgroundColor: Colors.lavanderDark,
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestionSubmitButtonText: {
    fontSize: 16,
    fontWeight: '600',
    color: 'white',
  },
});
