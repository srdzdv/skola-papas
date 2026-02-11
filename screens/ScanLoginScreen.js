import React, { useState, useEffect } from 'react';
import { trackEvent } from "@aptabase/react-native";
import NotificationService from '../NotificationService.js';
import * as RootNavigation from '../navigation/RootNavigation';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { CameraView, useCameraPermissions } from 'expo-camera';

var Parse = require('parse/react-native');
import Colors from '../constants/Colors';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  Alert,
  TouchableOpacity,
  View,
  Dimensions,
  Button,
} from 'react-native';
import * as Notifications from 'expo-notifications'


const LoginScreen = () => {
  const [permission, requestPermission] = useCameraPermissions();
  const [scannedData, setScannedData] = useState("");
  const [isLoading, setIsLoading] = useState(false);


  useEffect(() => {
    const getPermissionsAsync = async () => {
      if (!permission || !permission.granted) {
        await requestPermission();
      }
    };
    getPermissionsAsync();
  }, []); // Empty dependency array means this runs once on mount

  function handleScannedData(qrData) {
    if (scannedData.length == 0) {
      setScannedData(qrData.data);
      setIsLoading(true);
      // Find Cliente in DB
      findScannedUserInDB(qrData.data);
    }
  };

  function findScannedUserInDB(data) {
    var userId = data.substring(0, 10);
    var User = Parse.Object.extend("User");
    var query = new Parse.Query(User);
    query.get(userId)
    .then((userFetched) => {
      if (userFetched) {
        // The object was retrieved successfully.
        loginUser(userFetched.get('username'));
      } else {
        setIsLoading(false);
        presentErrorFeedbackWithAction();
      }
    }, (error) => {
      // The object was not retrieved successfully.
      // error is a Parse.Error with an error code and message.
      setIsLoading(false);
      presentErrorFeedbackWithAction();
    });
  }

  async function loginUser(username) {
    console.log("loginUser: " + username);
    const password = "Angel550";
    try {
      const user = await Parse.User.logIn(username, password);
      var status = user.get('status');
      if (status == 0) {
        var usertype = user.get('usertype');
        var parentesco = user.get('parentesco');
        var userPlantel = user.get('plantel');
        var escuela = user.get('escuela');
        if (usertype == 2) {
            if (parentesco == "Mamá" || parentesco == "Papá") {
              // console.log("Login Success: " + parentesco + " " + userPlantel + " " + escuela.id);
              loginSuccess(parentesco, userPlantel, escuela.id);
            } else {
              // Logout user
              logOutInvalidUser();
              // Invalid parentesco
              presentFeedback("Usuario no autorizado", "Sólo Mamá o Papá pueden tener acceso a la aplicación.");
            }
        } else {
          // Logout user
          logOutInvalidUser();
          // Invalid usertype
          presentFeedback("Usuario no autorizado", "Sólo Papás pueden tener acceso a la aplicación por el momento.");
        }
      } else {
        logOutInvalidUser();
        presentFeedback("Usuario Bloqueado", "Usuario no tiene permiso para acceder a la aplicaión.");
      }
    } catch (error) {
      console.log("loginUser_catch: " + error);
      presentFeedback("Algo inesperado", "Hubo un error al intentar iniciar sesión. Intenta de nuevo, por favor.");
    }
  }

  function loginSuccess(parentesco, userPlantel, escuelaId) {
    // Aptabase
    trackEvent("login_success", {
      type: "qr_scan",
      escuela: escuelaId,
      parentesco: parentesco
    });
    // Expo Push Token
    registerForPushNotificationsAsync();
    // Navigate to Home
    RootNavigation.navigate('Home');
  }


  function logOutInvalidUser() {
    Parse.User.logOut().then(() => {
      console.log("SCAN User Logged out. Parse");
      // Remove userPlantel from Storage
      AsyncStorage.removeItem("userPlantel", () => {
        console.log("SCAN Removed userPlantel from AsyncStorage");
      });
    });
  }

 // Expo Notifications //
 async function registerForPushNotificationsAsync() {
    await NotificationService.registerForPushNotificationsAsync(this.presentFeedback);
}
 // Expo Notifications //

 function goBack() {
    RootNavigation.navigate('Login');
  }

  function presentFeedback(alertTitle, alertMessage) {
    Alert.alert(
      alertTitle,
      alertMessage,
      [
        {text: 'Ok', onPress: null, style: 'default'},
      ],
      {cancelable: false},
    );
  }

  function presentErrorFeedbackWithAction() {
    Alert.alert(
      "Usuario Inválido",
      "El usuario es inválido. No es posible ingresar a la aplicación. Intenta con un usuario válido.",
      [
        {text: 'Ok', onPress: () => RootNavigation.navigate('Login'), style: 'default'},
      ],
      {cancelable: false},
    );
  }



  // Check if permission is not granted
  if (!permission || !permission.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.permissionsText}>La aplicación no tiene acceso a la cámara del dispositivo. Ingresa a Ajustes de tu celular y concede permiso a la aplicación para el uso de la cámara.</Text>
        <TouchableOpacity onPress={() => goBack()} >
          <Text style={styles.backBtnText}>Regresar</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
      <View style={styles.container}>
        <View style={{ flex: 1,  justifyContent: 'center', alignItems: 'center', textAlign: 'center', paddingHorizontal: 16 }}>
          <Text style={styles.headerTitle}>Ingreso con Credencial</Text>
          <Text style={styles.headerSubtitle}>Muestra el código QR de tu credencial del Colegio a la cámara.</Text>
          <Button
          style={styles.cerrarModalButton}
          title='Regresar'
          color={Colors.sunflowerLight}
          onPress={() => goBack()}
          />
          {
            isLoading ? (
              <ActivityIndicator size="large" color="#ffff" animating={isLoading} style={{marginTop: 94}} hidesWhenStopped={true}/>
            ) 
            : 
            (
              <CameraView
                barcodeScannerSettings={{
                  barcodeTypes: ["qr"],
                }}
                onBarcodeScanned={(data) => handleScannedData(data)}
                style={{ height: 400, width: Dimensions.get('window').width, justifyContent: 'center', alignItems: 'center', borderRadius: 3 }}
              />
            )
          }
        </View>
      </View>
    );
  
}

export default LoginScreen;


const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.lavanderLight,
  },
  headerTitle: {
    marginTop: 8,
    color: 'white',
    fontSize: 22,
    fontWeight: 'bold'
  },
  headerSubtitle: {
    marginTop: 8,
    color: 'white',
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
    textAlign: 'center' 
  },
  permissionsText: {
    marginTop: 80, 
    color: 'white',
    fontWeight: '600',
    margin: 16
  },
  backBtnText: {
    color: Colors.actionColor,
    fontWeight: '700',
    marginTop: 24,
    marginLeft: 18
  },
});
