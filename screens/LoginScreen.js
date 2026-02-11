import React from 'react';
import { trackEvent } from "@aptabase/react-native";
import NotificationService from '../NotificationService.js';
import AsyncStorage from '@react-native-async-storage/async-storage';
import ParseInit from '../ParseInit.js';
var Parse = require('parse/react-native');
import Colors from '../constants/Colors';
import { AuthContext } from '../context/AuthContext';
import {
  Platform,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  Alert,
  View,
  TextInput,
  ActivityIndicator,
  Image,
} from 'react-native';
import * as Notifications from 'expo-notifications'
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import * as RootNavigation from '../navigation/RootNavigation';

const plantelNames = [{valor: "mtToluca", key:"5", nombre: "Moms & Tots Toluca"}, {valor: "mtMetepec", key:"6", nombre:"Moms & Tots Metepec"}, {valor: "skola", key:"7", nombre:"nook junior school"}, {valor: "skola", key:"8", nombre:"Otra Escuela"}];

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

export default class LoginScreen extends React.Component {
  static contextType = AuthContext;

  constructor(props) {
    super(props);
    this.state = { isLoading: false,
                   showSelectPlantelModal: false,
                   username: "",
                   password: "",
                   credencialLogin: false };
  }

  UNSAFE_componentWillMount() {
    // Register Push Notification
    this.registerForPushNotificationsAsync();
  }

  static navigationOptions = {
    header: null,
  };

  didSelectItem(item) {
    // Plantel selected?
    // ParseInit
    let parseInit = new ParseInit();
    parseInit.initParseSDKForPlantel(item.valor);
    // User Logout
    Parse.User.logOut();
    // Plantel selected
    this.storeUserPlantel(item.valor);

    this.setState({showSelectPlantelModal: false});
  
    // Move navigation logic outside of setState
    // It wraps the navigation logic in a `setTimeout` with a 0ms delay, which pushes the execution to the next event loop, after the current render cycle is complete.
    setTimeout(() => {
      if (this.state.credencialLogin) {
        RootNavigation.navigate('ScanLogin');
      } else {
        this.logUserWithPlantelSelected();
      }
    }, 100);
  }

  storeUserPlantel(plantel) {
    try {
      AsyncStorage.setItem('userPlantel', plantel).then(() => {
        console.log("userPlantel Storage: " + plantel);
      });
    } catch (error) {
      // Error saving data
      console.log("ERROR storing plantel in AsyncStorage: " + JSON.stringify(error));
    }
  };

  render() {
    return (
      <View style={styles.container}>
        <View style={styles.header}>
            <Text style={styles.headerTitle}>Skola Papás</Text>
        </View>
        <View style={styles.container} contentContainerStyle={styles.contentContainer}>
          <View style={styles.componentContainer}>
            <Text style={styles.welcomeText}>¡Bienvenidos!</Text>
              <Text style={styles.formLabel}>Usa la credencial con código QR que la escuela te proporcionó aquí:</Text>
              <TouchableOpacity style={styles.ingresarCredencialButton} onPress={this._handleScanLoginPress}> 
                <Text style={styles.loginButtonText}>Ingresar con credencial</Text>
              </TouchableOpacity>

              <View style={styles.divider}></View>

              {
                this.state.showSelectPlantelModal && (
                    <View style={styles.selectPlantelModal}>
                        <TouchableOpacity onPress={() => { this.setState({showSelectPlantelModal: false})}}>
                            <Text style={styles.backBtnText}>Cerrar</Text>
                        </TouchableOpacity>
                        <View style={{alignItems: 'center'}}>
                          <Text style={styles.modalTitle}>Selecciona tu Escuela:</Text>
                            
                              <FlatList
                                data={plantelNames}
                                style={{backgroundColor: 'white', marginTop: 8, borderRadius: 5}}
                                renderItem={({item}) => 
                                <TouchableOpacity onPress={() => {this.didSelectItem(item)}}>
                                  <View style={{alignItems: 'center'}}>
                                    <Text style={{padding: 6, fontSize: 16, height: 36, color: Colors.darkGrayDark, fontWeight: item.nombre == 'Otra Escuela' ? '600' : '400'}}>
                                    {item.nombre}
                                    </Text>
                                  </View>
                                  <View style={styles.dividerView}></View>
                                </TouchableOpacity>
                                }
                              />
                            
                     
                        </View>
                    </View>
                )
              }

              <TextInput style={styles.whiteTextField} onChangeText={(text) => this.setState({username: text})} placeholder={"Usuario"} keyboardType={'email-address'} autoCapitalize={'none'}/>
              <TextInput style={styles.whiteTextField} onChangeText={(text) => this.setState({password: text})} placeholder={"Contraseña"} secureTextEntry={true}/>
              <TouchableOpacity style={styles.loginButton} onPress={this._handleLoginPress}> 
                <Text style={styles.loginButtonText}>Ingresar</Text>
              </TouchableOpacity>
              {
                this.state.isLoading && (
                    <ActivityIndicator size="small" color="#fff" animating={this.state.isLoading} style={{marginTop: 12, marginBottom: 8}} hidesWhenStopped={true}/>
                )
              }

              <View style={styles.divider}></View>
              
          </View>
        </View>
      </View>
    );
  }

  _handleLoginPress = () => {
    // Empty string validations
    if (this.state.username.length > 0 && this.state.password.length > 0) {
      this.setState({ showSelectPlantelModal: true, credencialLogin: false });
    } else {
      Alert.alert(
        'Campos vacíos',
        'Tu usuario o contraseña están vacíos. Ingresa ambos para poder continuar.',
        [
          {text: 'Ok', onPress: null, style: 'default'},
        ],
        {cancelable: false},
      );
    }
  };

  logUserWithPlantelSelected() {
      // set loading state
      this.setState({ isLoading: true });
      // Call logIn
      this._logInAsync();
  }

  _logInAsync = async () => {
    console.log("Loging In User");
    const username = this.state.username;
    const password = this.state.password;
    const { signIn } = this.context;

    try {
        // Use AuthContext signIn method
        const result = await signIn(username, password);

        this.setState({ isLoading: false });

        if (result.success) {
          // Get user data for analytics
          const user = result.user;
          var parentesco = user.get('parentesco');
          var escuela = user.get('escuela');
          this.loginSuccess(parentesco, escuela.id);
        } else {
          // Handle specific error codes from AuthContext
          const errorCode = result.error?.code;

          if (errorCode === 'USER_BLOCKED') {
            this.presentFeedback("Usuario Bloqueado", "Usuario no tiene permiso para acceder a la aplicacion.");
          } else if (errorCode === 'INVALID_USER_TYPE') {
            this.presentFeedback("Solo Mama o Papa pueden ingresar", "Si requiere acceso especial a una persona autorizada por favor pidalo con la administracion del Colegio.");
          } else {
            // Parse error codes
            this._handleLoginErrorFeedback(result.error?.code);
          }
        }
      } catch (error) {
        // Show the error message somewhere and let the user try again.
        this.setState({ isLoading: false });
        this._handleLoginErrorFeedback(error.code);
      }
  };

  loginSuccess(parentesco, escuelaId) {
    // Aptabase
    trackEvent("login_success", {
      escuela: escuelaId,
      parentesco: parentesco,
      type: "username_password"
    });
    // Register expo push token
    this.registerForPushNotificationsAsync();
    // El login normal pueden entran todos los usertype 2
    RootNavigation.navigate('Home');
  }


  logOutInvalidUser() {
    Parse.User.logOut().then(() => {
      console.log("User Logged out. Parse");
      // Remove userPlantel from Storage
      AsyncStorage.removeItem("userPlantel", () => {
        console.log("Removed userPlantel from AsyncStorage");
      });
    });
  }

 // Expo Notifications //
 async registerForPushNotificationsAsync() {
    await NotificationService.registerForPushNotificationsAsync(this.presentFeedback);
 }
 // Expo Notifications //

  _handleLoginErrorFeedback(errorCode) {
    this.setState({ isLoading: false });
    var alertTitle = "";
    var alertMessage = "";
    switch(errorCode) {
      case 101:
        alertTitle = "Usuario o contraseña inválido";
        alertMessage = "Intenta de nuevo.";
        break;
      case 200:
        alertTitle = "Usuario o contraseña vacío";
        alertMessage = "Ingresa usuario y contraseña para continuar.";
      break;
    }
    this.presentFeedback(alertTitle, alertMessage);
  }

  _handleScanLoginPress = () => {
    this.setState({showSelectPlantelModal: true, credencialLogin: true});
  };

  presentFeedback(alertTitle, alertMessage) {
    Alert.alert(
      alertTitle,
      alertMessage,
      [
        {text: 'Ok', onPress: null, style: 'default'},
      ],
      {cancelable: false},
    );
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.bluejeansLight,
  },
  contentContainer: {
    paddingTop: 8,
  },
  divider: {
    height: 2,
    width: '100%',
    backgroundColor: Colors.bluejeansDark,
    marginTop: 16,
    marginBottom: 16
  },
  header: {
    backgroundColor: Colors.bluejeansDark,
    height: 88,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    marginTop: 40,
    color: 'white',
    fontSize: 24,
    fontWeight: 'bold'
  },
  welcomeText: {
    marginTop: 2,
    marginBottom: 8,
    color: 'white',
    fontSize: 22,
    fontWeight: 'bold'
  },
  componentContainer: {
    alignItems: 'center',
    backgroundColor: Colors.bluejeansLight,
    paddingTop: 8,
    paddingBottom: 56
  },
  formLabel: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '400',
    marginLeft: 12,
    marginBottom: 8,
    textAlign: 'center',
  },
  whiteTextField: {
    marginBottom: 12,
    backgroundColor: '#fff',
    paddingLeft: 4,
    height: 34,
    color: Colors.darkGrayDark,
    width: '100%',
    textAlign: 'center'
  },
  loginButton:{
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.sunflowerLight,
    marginTop: 12,
    height: 42,
    width: '70%',
  },
  ingresarCredencialButton: {
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: Colors.grassLight,
    marginTop: 12,
    height: 42,
    width: '90%',
    marginBottom: 16,
  },
  loginButtonText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '600'
  },
  buttonView: {
      alignItems: 'center'
  },
  monstruosView: {
    marginTop: 16,
    flex: 1, 
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    width: '70%',
    paddingLeft: 32,
  },
  logoImgPepi: {
    height: 80,
    resizeMode: 'contain',
    marginRight: -24,
  },
  logoImg: {
    height: 80,
    resizeMode: 'contain',
  },
  logoImgKido : {
    height: 70,
    marginLeft: -40,
    resizeMode: 'contain',
  },
  selectPlantelModal: {
    position: 'absolute', 
    zIndex: 5, 
    shadowOffset:{  width: 8,  height: 8,  }, 
    shadowColor: Colors.darkGrayLight, 
    shadowOpacity: 0.8,
    elevation: 1, 
    height: 270, 
    width: '80%', 
    borderRadius: 8, 
    backgroundColor: Colors.lavanderDark,
    marginTop: 2,
  },
  modalTitle: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16
  },
  backBtnText: {
    color: Colors.actionColor,
    fontWeight: '500',
    marginTop: 4,
    marginBottom: 8,
    marginLeft: 8
  },
  flatlistContainer: {
    flex: 1,
    paddingTop: 8
  },
  dividerView: {
    height: 1,
    backgroundColor: Colors.lavanderLight,
    margin: 2
},
});
