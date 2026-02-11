import React, { useState, useEffect, useCallback, useRef, useMemo, useContext } from 'react';
import { trackEvent } from "@aptabase/react-native";
var Parse = require('parse/react-native');
import Colors from '../constants/Colors';
import Constants from '../constants/Constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as RootNavigation from '../navigation/RootNavigation';
import NetworkState from '../components/Network.js';
import { getOLDS3SignedUrl, getSignedObjectUrl } from '../s3API.js';
import { Image as ExpoImage } from 'expo-image';
import { AuthContext } from '../context/AuthContext';
import {
  Platform,
  ScrollView,
  StyleSheet,
  SafeAreaView,
  Text,
  Pressable,
  View,
  Dimensions,
  Alert,
} from 'react-native';

const screenWidth = Dimensions.get('window').width;
const screenHeight = Dimensions.get('window').height;

// AsyncStorage keys
const AS_KEYS = [
  'qrCodeStringAS',
  'paqueteAlumnoAS',
  'nombreAlumnoAS',
  'parentescoPersonaAutorizadaAS',
  'nombrePersonaAutorizadaAS',
  'userPhotURLAS',
  'userEstudianteIDs'
];

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

export default function CredencialScreen() {
  // Get signOut from AuthContext
  const { signOut } = useContext(AuthContext);

  // Calculate image size based on screen height
  const userImageSize = useMemo(() => screenHeight > 592 ? 250 : 150, []);

  // State
  const [userPhotURL, setUserPhotURL] = useState("");
  const [isLoading, setIsLoading] = useState(true);
  const [hasMultiChildren, setHasMultiChildren] = useState(false);
  const [nombrePersonaAutorizada, setNombrePersonaAutorizada] = useState("");
  const [parentescoPersonaAutorizada, setParentescoPersonaAutorizada] = useState("");
  const [nombreAlumno, setNombreAlumno] = useState("");
  const [paqueteAlumno, setPaqueteAlumno] = useState("");
  const [qrCodeString, setQrCodeString] = useState("");
  const [showQRCode, setShowQRCode] = useState(false);
  const [estudianteIDsArr, setEstudianteIDsArr] = useState([]);
  const [estudianteObjects, setEstudianteObjects] = useState(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [asyncStorageIsSet, setAsyncStorageIsSet] = useState(false);

  // Refs
  const currentUserRef = useRef(new Parse.User());

  // Navigation options
  CredencialScreen.navigationOptions = {
    header: null,
  };

  // Initialize on mount
  useEffect(() => {
    getDataFromAsyncStorage();
  }, []);

  // Save to AsyncStorage when all data is ready
  useEffect(() => {
    if (!asyncStorageIsSet &&
        qrCodeString.length > 0 &&
        paqueteAlumno.length > 0 &&
        nombreAlumno.length > 0 &&
        parentescoPersonaAutorizada.length > 0 &&
        nombrePersonaAutorizada.length > 0 &&
        userPhotURL.length > 0 &&
        estudianteIDsArr.length > 0) {
      multiSetDataToAsyncStorage();
    }
  }, [qrCodeString, paqueteAlumno, nombreAlumno, parentescoPersonaAutorizada, nombrePersonaAutorizada, userPhotURL, estudianteIDsArr, asyncStorageIsSet]);

  const getDataFromAsyncStorage = async () => {
    try {
      const stores = await AsyncStorage.multiGet(AS_KEYS);

      // Check if first value exists
      const firstValue = stores[0][1];
      if (firstValue === null || stores.length === 0) {
        checkNetworkStatus();
        return;
      }

      console.log("***We got local data!");

      // Parse stored values
      const storeMap = {};
      stores.forEach(([key, value]) => {
        storeMap[key] = value;
      });

      const qrCodeStringValue = storeMap['qrCodeStringAS'] || "";
      const paqueteAlumnoValue = storeMap['paqueteAlumnoAS'] || "";
      const nombreAlumnoValue = storeMap['nombreAlumnoAS'] || "";
      const parentescoValue = storeMap['parentescoPersonaAutorizadaAS'] || "";
      const nombreValue = storeMap['nombrePersonaAutorizadaAS'] || "";
      const userPhotURLValue = storeMap['userPhotURLAS'] || "";
      const userEstudianteIDsArr = storeMap['userEstudianteIDs']
        ? storeMap['userEstudianteIDs'].split(",")
        : [];

      // Validate all required data exists
      if (qrCodeStringValue && paqueteAlumnoValue && nombreAlumnoValue &&
          parentescoValue && nombreValue) {

        const multiChildren = userEstudianteIDsArr.length > 1;

        // Get user for local storage flow
        const user = await Parse.User.currentAsync();
        if (user) {
          currentUserRef.current = user;
        }

        // Update all state at once
        setQrCodeString(qrCodeStringValue);
        setShowQRCode(true);
        setAsyncStorageIsSet(true);
        setPaqueteAlumno(paqueteAlumnoValue);
        setNombreAlumno(nombreAlumnoValue);
        setParentescoPersonaAutorizada(parentescoValue);
        setNombrePersonaAutorizada(nombreValue);
        setUserPhotURL(userPhotURLValue);
        setHasMultiChildren(multiChildren);
        setCurrentIndex(0);
        setEstudianteIDsArr(userEstudianteIDsArr);

        if (multiChildren) {
          getEstudianteObjects(userEstudianteIDsArr);
        }
      } else {
        checkNetworkStatus();
      }
    } catch (error) {
      console.log("AsyncStorage error:", error);
      checkNetworkStatus();
    }
  };

  const multiSetDataToAsyncStorage = async () => {
    try {
      const keyValuesArr = [
        ['qrCodeStringAS', qrCodeString],
        ['paqueteAlumnoAS', paqueteAlumno],
        ['nombreAlumnoAS', nombreAlumno],
        ['parentescoPersonaAutorizadaAS', parentescoPersonaAutorizada],
        ['nombrePersonaAutorizadaAS', nombrePersonaAutorizada],
        ['userPhotURLAS', userPhotURL]
      ];
      await AsyncStorage.multiSet(keyValuesArr);
      console.log("multiSetDataToAsyncStorage DONE");
      setAsyncStorageIsSet(true);
    } catch (error) {
      console.log("Error saving to AsyncStorage:", error);
    }
  };

  const checkNetworkStatus = () => {
    const networkStateIsConnected = NetworkState.checkNetworkState();
    if (networkStateIsConnected) {
      getCurrentUser();
    } else {
      presentFeedback(Constants.noNetworkConexionAlertTitle, Constants.noNetworkConexionAlertMessage);
    }
  };

  const handleConnectionChange = useCallback((isConnected) => {
    console.log("is connected?: " + isConnected);
    if (isConnected) {
      if (nombrePersonaAutorizada.length === 0 && qrCodeString.length === 0 &&
          nombreAlumno.length === 0 && parentescoPersonaAutorizada.length === 0) {
        console.log("Network listener ON");
        getCurrentUser();
      }
    } else {
      presentFeedback(Constants.noNetworkConexionAlertTitle, Constants.noNetworkConexionAlertMessage);
    }
  }, [nombrePersonaAutorizada, qrCodeString, nombreAlumno, parentescoPersonaAutorizada]);

  const getCurrentUser = async () => {
    try {
      const user = await Parse.User.currentAsync();
      if (user !== null) {
        currentUserRef.current = user;
        const userNombre = user.get('nombre');
        const userApellido = user.get('apellidos');
        const userParentesco = user.get('parentesco');
        const userFullName = userNombre + " " + userApellido;

        setNombrePersonaAutorizada(userFullName);
        setParentescoPersonaAutorizada(userParentesco);

        // Fetch user estudiantes and photo in parallel
        await Promise.all([
          getUserEstudiantes(),
          fetchUserPhoto(user)
        ]);
      } else {
        presentSessionLogOutAlert();
      }
    } catch (error) {
      console.log("Error getting current user:", error);
      presentSessionLogOutAlert();
    }
  };

  const presentSessionLogOutAlert = () => {
    Alert.alert(
      'Tu sesion ha expirado.',
      'Es necesario que inicies sesion con tu credencial de nuevo. La pantalla para iniciar sesion se va a presentar a continuacion.',
      [{ text: 'Ok', style: 'default', onPress: () => signOut() }]
    );
  };

  const getUserEstudiantes = async () => {
    try {
      const value = await AsyncStorage.getItem('userEstudianteIDs');
      if (value !== null) {
        const estudianteIDs = value.split(",");
        // Generate QR code and get estudiante objects in parallel
        generateQRCodeString(estudianteIDs);
        await getEstudianteObjects(estudianteIDs);
      }
    } catch (error) {
      console.log("Error AsyncStorage: " + JSON.stringify(error));
    }
  };

  const fetchUserPhoto = async (userObject) => {
    try {
      const UserPhoto = Parse.Object.extend("UserPhoto");
      const query = new Parse.Query(UserPhoto);
      query.equalTo("user", userObject);
      const userPhotoFetched = await query.first();

      if (userPhotoFetched) {
        const isNewS3Bucket = userPhotoFetched.get("newS3Bucket");
        await getFileSignedURL(userPhotoFetched.id, isNewS3Bucket);
      }
    } catch (error) {
      console.log("Error fetching user photo: " + JSON.stringify(error));
    }
  };

  const getFileSignedURL = async (objectId, isNewS3Bucket) => {
    try {
      let url;
      if (isNewS3Bucket) {
        url = await getSignedObjectUrl(objectId);
      } else {
        url = await getOLDS3SignedUrl(objectId);
      }

      if (url && url.length > 0) {
        setUserPhotURL(url);
      } else {
        console.log("EMPTY URL fetching user photo: " + objectId);
      }
    } catch (error) {
      console.log("Error getting signed URL:", error);
    }
  };

  const generateQRCodeString = (estudianteIDs) => {
    const estudiante0 = estudianteIDs[0];
    const userObjId = currentUserRef.current.id;
    const newQrCodeString = userObjId + "-" + estudiante0;
    const multiChildren = estudianteIDs.length > 1;

    if (multiChildren) {
      console.log("Has Multi Children");
    } else {
      console.log("ONE CHILDREN");
    }

    setQrCodeString(newQrCodeString);
    setHasMultiChildren(multiChildren);
    setCurrentIndex(0);
    setEstudianteIDsArr(estudianteIDs);
    setShowQRCode(true);
  };

  const getEstudianteObjects = async (estudianteIDs) => {
    try {
      const Estudiantes = Parse.Object.extend("Estudiantes");
      const query = new Parse.Query(Estudiantes);
      query.containedIn("objectId", estudianteIDs);
      query.include("grupo");
      const results = await query.find();

      console.log("getEstudianteObjects retrieved " + results.length + " Estudiante objects.");

      if (results.length > 0) {
        const estudiante0Nombre = results[0].get("NOMBRE") + " " + results[0].get("APELLIDO");
        const grupoObj = results[0].get("grupo");
        const estudiante0Grupo = grupoObj.get('name');

        setEstudianteObjects(results);
        setNombreAlumno(estudiante0Nombre);
        setPaqueteAlumno(estudiante0Grupo);
      }
    } catch (error) {
      console.log("Error getting estudiante objects:", error);
    }
  };

  const changeQRCodeString = useCallback(() => {
    const arrLength = estudianteIDsArr.length;
    let newIndex = currentIndex + 1;
    if (newIndex > arrLength - 1) {
      newIndex = 0;
    }

    const newEstudiante = estudianteIDsArr[newIndex];
    const userObjId = currentUserRef.current.id;
    const newQrCodeString = userObjId + "-" + newEstudiante;

    // OFFLINE fallback
    let estudianteNombreString = "Sin conexion a Internet.";
    let grupoNombreString = "El codigo es valido. Se puede escanear.";

    if (estudianteObjects && estudianteObjects[newIndex]) {
      estudianteNombreString = estudianteObjects[newIndex].get("NOMBRE") + " " + estudianteObjects[newIndex].get("APELLIDO");
      const grupoObj = estudianteObjects[newIndex].get("grupo");
      grupoNombreString = grupoObj.get('name');
    }

    setQrCodeString(newQrCodeString);
    setCurrentIndex(newIndex);
    setNombreAlumno(estudianteNombreString);
    setPaqueteAlumno(grupoNombreString);
  }, [currentIndex, estudianteIDsArr, estudianteObjects]);

  const removeExpoPushToken = useCallback(async () => {
    try {
      const expoPushToken = await AsyncStorage.getItem('expoPushToken');
      if (expoPushToken !== null) {
        await AsyncStorage.removeItem('expoPushToken');

        if (estudianteObjects) {
          // Update all estudiante objects in parallel
          const updatePromises = estudianteObjects.map(async (estudianteObj) => {
            const tokensArr = estudianteObj.get('expoPushToken') || [];
            if (tokensArr.includes(expoPushToken)) {
              const index = tokensArr.indexOf(expoPushToken);
              tokensArr.splice(index, 1);
              estudianteObj.set("expoPushToken", tokensArr);
              await estudianteObj.save();
            }
          });

          await Promise.allSettled(updatePromises);
        }
      }
    } catch (error) {
      console.log("ERROR removing expoPushToken:", error);
    }
  }, [estudianteObjects]);

  const userLogOut = useCallback(async () => {
    try {
      // Remove Expo Push token first (specific to CredencialScreen)
      await removeExpoPushToken();

      // Use AuthContext signOut for the rest
      await signOut();
    } catch (error) {
      console.log("Error during logout:", error);
      // Fallback: try to navigate anyway
      RootNavigation.navigate('RootAuth');
    }
  }, [removeExpoPushToken, signOut]);

  const cerrarSesionBtnPressed = useCallback(() => {
    Alert.alert(
      'Cerrar sesion?',
      'Si deseas cerrar sesion presiona el boton de confirmacion.',
      [
        { text: 'Si, cerrar sesion', style: 'destructive', onPress: () => userLogOut() },
        { text: 'Cancelar', style: 'cancel' },
      ]
    );
  }, [userLogOut]);

  const cambiarAlumnoBtnPressed = useCallback(() => {
    changeQRCodeString();
  }, [changeQRCodeString]);

  const presentFeedback = (alertTitle, alertMessage) => {
    Alert.alert(
      alertTitle,
      alertMessage,
      [{ text: 'Ok', onPress: null, style: 'default' }],
      { cancelable: false },
    );
  };

  // Memoized QR code URL
  const qrCodeUrl = useMemo(() => {
    if (!qrCodeString) return null;
    return 'https://api.qrserver.com/v1/create-qr-code/?data=' + qrCodeString;
  }, [qrCodeString]);

  // Memoized user image style
  const userImageStyle = useMemo(() => ({
    height: userImageSize,
    width: userImageSize,
    borderRadius: 10,
    marginTop: 6
  }), [userImageSize]);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.headerContainer}>
          <Text style={styles.titleText}>Credencial de Acceso</Text>
          <Pressable style={styles.cerrarSesionBtn} onPress={cerrarSesionBtnPressed}>
            <Text style={styles.cerrarSesionBtnText}>Cerrar sesion</Text>
          </Pressable>
        </View>
        <View style={styles.dividerView} />
        <ScrollView contentContainerStyle={styles.contentContainer}>
          {userPhotURL.length > 0 && (
            <ExpoImage
              source={{ uri: userPhotURL }}
              style={userImageStyle}
              contentFit="cover"
              transition={200}
              cachePolicy="memory-disk"
            />
          )}

          <Text style={styles.perAutNombreText}>{nombrePersonaAutorizada}</Text>
          <Text style={styles.perAutPartentescoText}>{parentescoPersonaAutorizada}</Text>

          <View style={styles.dividerView} />

          {showQRCode && qrCodeUrl && (
            <View style={styles.qrCodeContainer}>
              <ExpoImage
                source={{ uri: qrCodeUrl }}
                style={styles.qrCodeImage}
                contentFit="contain"
                cachePolicy="memory-disk"
              />
            </View>
          )}

          <Text style={styles.nombreAlumnoText}>{nombreAlumno}</Text>
          <Text style={styles.paqueteAlumnoText}>{paqueteAlumno}</Text>

          <View style={styles.dividerView} />

          {hasMultiChildren && (
            <Pressable style={styles.cambiarAlumnoBtn} onPress={cambiarAlumnoBtnPressed}>
              <Text style={styles.cambiarAlumnoBtnText}>Cambiar Alumno</Text>
            </Pressable>
          )}
        </ScrollView>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.bittersweetLight
  },
  container: {
    alignItems: 'center',
    paddingTop: Platform.OS === 'ios' ? -4 : 24,
    marginBottom: 32,
    backgroundColor: Colors.bittersweetLight,
  },
  contentContainer: {
    alignItems: 'center',
  },
  headerContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    width: '100%',
    paddingHorizontal: 16,
    marginBottom: 2,
  },
  titleText: {
    color: 'white',
    fontSize: 17,
    fontWeight: '600',
  },
  cerrarSesionBtn: {
    backgroundColor: Colors.bittersweetDark,
    paddingVertical: 4,
    paddingHorizontal: 8,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cerrarSesionBtnText: {
    color: Colors.actionColor,
    fontWeight: '600',
    fontSize: 12,
  },
  perAutNombreText: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold'
  },
  perAutPartentescoText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '400',
  },
  cambiarAlumnoBtn: {
    backgroundColor: Colors.actionColor,
    width: 200,
    height: 34,
    padding: 4,
    marginTop: 12,
    marginBottom: 64,
    borderRadius: 5,
    alignItems: 'center',
    justifyContent: 'center'
  },
  cambiarAlumnoBtnText: {
    color: 'black',
    fontWeight: '600'
  },
  nombreAlumnoText: {
    color: 'white',
    fontSize: 22,
    fontWeight: '600',
    marginTop: 8,
  },
  paqueteAlumnoText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '400',
    marginTop: 2,
    marginBottom: 0
  },
  dividerView: {
    height: 2,
    width: screenWidth - 16,
    backgroundColor: Colors.bittersweetDark,
    marginTop: 6
  },
  qrCodeContainer: {
    overflow: 'hidden',
    marginTop: 8
  },
  qrCodeImage: {
    height: 250,
    width: 250
  },
});
