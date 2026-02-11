import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import { trackEvent } from "@aptabase/react-native";
var Parse = require('parse/react-native');
import Colors from '../constants/Colors';
import Constants from '../constants/Constants';
import dayjs from '../utils/dayjs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  SafeAreaView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  Pressable,
  View,
  Dimensions,
  ActivityIndicator,
  TextInput,
  Alert,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Image as ExpoImage } from 'expo-image';
import DateTimePicker from 'react-native-modal-datetime-picker';
const screenWidth = Dimensions.get('window').width;
import NetworkState from '../components/Network.js';

const DATE_FORMAT_STRING = "dddd DD MMMM, YYYY";

// Memoized service item component
const ServicioItem = memo(function ServicioItem({
  id,
  nombre,
  precio,
  onPress,
}) {
  const handlePress = useCallback(() => {
    onPress(id);
  }, [id, onPress]);

  return (
    <Pressable onPress={handlePress} style={styles.servicioCard}>
      <View style={styles.servicioCardContent}>
        <Text style={styles.servicioNombreText}>{nombre}</Text>
        <Text style={styles.servicioPrecioText}>{precio}</Text>
      </View>
    </Pressable>
  );
});

export default function AdminHome({ navigation }) {
  // State
  const [isLoading, setIsLoading] = useState(true);
  const [data, setData] = useState([]);
  const [mostrarServicios, setMostrarServicios] = useState(false);
  const [hasData, setHasData] = useState(true);
  const [showServicioModal, setShowServicioModal] = useState(false);
  const [currentEstudianteNombre, setCurrentEstudianteNombre] = useState("");
  const [hasMultipleChildren, setHasMultipleChildren] = useState(false);
  const [dateString, setDateString] = useState(dayjs().format(DATE_FORMAT_STRING));
  const [selectedDateObj, setSelectedDateObj] = useState(dayjs().toDate());
  const [isDateTimePickerVisible, setIsDateTimePickerVisible] = useState(false);
  const [isLoadingModal, setIsLoadingModal] = useState(false);
  const [servicioSolicitadoComentarios, setServicioSolicitadoComentarios] = useState("");
  const [selectedServicio, setSelectedServicio] = useState(null);
  const [currentEstudianteIndex, setCurrentEstudianteIndex] = useState(0);

  // Refs
  const currentUserRef = useRef(null);
  const currentEscuelaRef = useRef(null);
  const estudiantesDataRef = useRef([]);
  const dataMapRef = useRef(new Map());

  // Navigation options
  AdminHome.navigationOptions = {
    header: null,
  };

  // Initialize on mount
  useEffect(() => {
    initializeScreen();
  }, []);

  const initializeScreen = async () => {
    try {
      // Get deep link and check network in parallel
      const [deepObjId, networkConnected] = await Promise.all([
        getDeepObjIdAsyncStorage(),
        Promise.resolve(NetworkState.checkNetworkState())
      ]);

      if (deepObjId) {
        console.log("We have a DeepLink");
        destroyDeepLinkFromAsyncStorage();
        // Store for later navigation after data loads
        currentUserRef.current = { deepLinkScreen: deepObjId };
      }

      if (!networkConnected) {
        presentFeedback(Constants.noNetworkConexionAlertTitle, Constants.noNetworkConexionAlertMessage);
        return;
      }

      await getCurrentUser(deepObjId);
    } catch (error) {
      console.log("Error initializing screen:", error);
      setIsLoading(false);
    }
  };

  const getDeepObjIdAsyncStorage = async () => {
    try {
      const deepObjId = await AsyncStorage.getItem('deepObjId');
      return deepObjId;
    } catch (error) {
      console.log("ERROR retrieving deepObjId:", error);
      return null;
    }
  };

  const destroyDeepLinkFromAsyncStorage = async () => {
    try {
      await AsyncStorage.removeItem("deepObjId");
      console.log("**Removed deepObjId from AsyncStorage");
    } catch (error) {
      console.log("Error removing deepObjId:", error);
    }
  };

  const shouldDisplayServicios = (escuela) => {
    const mostrarServiciosBool = escuela.id !== "n8nIxUCfG7" && escuela.id !== "hYEvMwGcda";
    setMostrarServicios(mostrarServiciosBool);
    return mostrarServiciosBool;
  };

  const getCurrentUser = async (deepLinkScreen) => {
    try {
      const user = await Parse.User.currentAsync();
      if (!user) return;

      currentUserRef.current = user;
      const escuela = user.get('escuela');
      currentEscuelaRef.current = escuela;

      shouldDisplayServicios(escuela);

      // Fetch servicios and estudiantes in parallel
      await Promise.all([
        retreiveServiciosDisponibles(escuela),
        getUserEstudiantes(user, deepLinkScreen)
      ]);
    } catch (error) {
      console.log("Error getting current user:", error);
      setIsLoading(false);
    }
  };

  const retreiveServiciosDisponibles = async (escuela) => {
    try {
      const Servicio = Parse.Object.extend("Servicio");
      const query = new Parse.Query(Servicio);
      query.equalTo("escuela", escuela);
      query.equalTo("activo", true);

      const servicios = await query.find();

      if (servicios.length === 0) {
        setHasData(false);
        setIsLoading(false);
        return;
      }

      const dataArr = [];
      const newDataMap = new Map();

      for (let i = 0; i < servicios.length; i++) {
        const object = servicios[i];
        const itemData = {
          id: object.id,
          nombre: object.get('nombre'),
          precio: "$" + object.get('precio'),
          descripcion: object.get('descripcion'),
          object: object
        };
        dataArr.push(itemData);
        newDataMap.set(object.id, itemData);
      }

      dataMapRef.current = newDataMap;
      setData(dataArr);
      setIsLoading(false);
    } catch (error) {
      console.log("Error fetching servicios:", error);
      presentFeedback("Algo salió mal", "No fue posible traer la información de la actividad. Intenta de nuevo, por favor.");
      setIsLoading(false);
    }
  };

  const getUserEstudiantes = async (user, deepLinkScreen) => {
    try {
      const Estudiantes = Parse.Object.extend("Estudiantes");
      const query = new Parse.Query(Estudiantes);
      query.equalTo("PersonasAutorizadas", user);
      query.equalTo("status", 0);
      query.include("grupo");

      const results = await query.find();
      processUserEstudiantes(results, deepLinkScreen);
    } catch (error) {
      console.log("ERROR getUserEstudiantes:", JSON.stringify(error));
    }
  };

  const processUserEstudiantes = (results, deepLinkScreen) => {
    console.log("Successfully retrieved " + results.length + " Estudiantes.");

    const isMultiChildren = results.length > 1;
    const estudiantesDataArr = results.map(estudianteObj => ({
      nombre: estudianteObj.get('NOMBRE') + " " + estudianteObj.get('APELLIDO'),
      object: estudianteObj
    }));

    estudiantesDataRef.current = estudiantesDataArr;
    setHasMultipleChildren(isMultiChildren);
    setCurrentEstudianteIndex(0);

    if (estudiantesDataArr.length > 0) {
      setCurrentEstudianteNombre(estudiantesDataArr[0].nombre);
    }

    if (deepLinkScreen) {
      navigateToDeepLinkScreen(deepLinkScreen);
    }
  };

  const navigateToDeepLinkScreen = (screen) => {
    console.log("navigateToDeepLinkScreen: " + screen);
    switch (screen) {
      case "pago":
        navigation.navigate("EdoCuenta");
        break;
      case "acceso":
        navigation.navigate("AccesosHistorial");
        break;
      case "servicio":
        navigation.navigate("ServiciosHistorial");
        break;
      case "factura":
        navigation.navigate("FacturasList");
        break;
      default:
        break;
    }
  };

  const cambiarEstudianteIndex = useCallback(() => {
    const estudianteData = estudiantesDataRef.current;
    setCurrentEstudianteIndex(prevIndex => {
      let newIndex = prevIndex + 1;
      if (newIndex > estudianteData.length - 1) {
        newIndex = 0;
      }
      setCurrentEstudianteNombre(estudianteData[newIndex].nombre);
      return newIndex;
    });
  }, []);

  const cambiarFechaBtnPressed = useCallback(() => {
    setIsDateTimePickerVisible(true);
  }, []);

  const handleDatePicked = useCallback((date) => {
    const selectedDateString = dayjs(date).format(DATE_FORMAT_STRING);
    const selectedDate = dayjs(date).toDate();
    setSelectedDateObj(selectedDate);
    setDateString(selectedDateString);
    setIsDateTimePickerVisible(false);
  }, []);

  const hideDateTimePicker = useCallback(() => {
    setIsDateTimePickerVisible(false);
  }, []);

  const solicitarServicioBtnPressed = useCallback(async () => {
    if (!selectedServicio?.object) {
      presentFeedback("Algo inesperado", 'El servicio está vacío. Intenta de nuevo, por favor. [error code]: 01');
      return;
    }

    if (!currentUserRef.current) {
      presentFeedback("Algo inesperado", 'El usuario es vacío. Intenta de nuevo, por favor. [error code]: 02');
      return;
    }

    const estudiantesArr = estudiantesDataRef.current;
    const currentEstudianteObj = estudiantesArr[currentEstudianteIndex]?.object;

    if (!currentEstudianteObj) {
      presentFeedback("Algo inesperado", 'El estudiante es vacío. Intenta de nuevo, por favor. [error code]: 03');
      return;
    }

    setIsLoadingModal(true);

    try {
      const ServicioSolicitado = Parse.Object.extend("ServicioSolicitado");
      const servicioSolicitado = new ServicioSolicitado();

      servicioSolicitado.set("servicio", selectedServicio.object);
      servicioSolicitado.set("personaAutorizada", currentUserRef.current);
      servicioSolicitado.set("status", 0);
      servicioSolicitado.set("fechaSolicitud", selectedDateObj);
      servicioSolicitado.set("comentarios", servicioSolicitadoComentarios);
      servicioSolicitado.set("estudiante", currentEstudianteObj);

      await servicioSolicitado.save();
      console.log('New object ServicioSolicitado: ' + servicioSolicitado.id);

      trackEvent("servicio_request", {
        escuela: currentEscuelaRef.current ? currentEscuelaRef.current.id : "",
        serviceType: selectedServicio.nombre || ""
      });

      await triggerPushCloudCode();
    } catch (error) {
      setIsLoadingModal(false);
      presentFeedback("Algo inesperado", 'Hubo un error al solicitar el servicio. Intenta de nuevo, por favor. [error code]: ' + error.message);
    }
  }, [selectedServicio, currentEstudianteIndex, selectedDateObj, servicioSolicitadoComentarios, currentEstudianteNombre]);

  const triggerPushCloudCode = async () => {
    console.log("RUNNING triggerCloudCode");
    const pushMessageString = "Confirmar Servicio solicitado: " + selectedServicio?.nombre + " Para: " + currentEstudianteNombre;
    const escuelaObjId = currentEscuelaRef.current?.id;
    console.log("Push escuelaObjId: " + escuelaObjId);

    try {
      const result = await Parse.Cloud.run("servicioSolicitadoAdminNotification", {
        pushMessage: pushMessageString,
        escuelaObjId: escuelaObjId
      });
      console.log("Cloud result: " + JSON.stringify(result));
      setIsLoadingModal(false);
      setShowServicioModal(false);
      presentFeedback("¡Servicio solicitado!", "El servicio ha sido solicitado y la Escuela ha sido notificada.");
    } catch (error) {
      setIsLoadingModal(false);
      setShowServicioModal(false);
      presentFeedback("Algo inesperado", "El servicio fue solicitado pero no pudimmos notificar a la Escuela. Notifica a la Escuela de tu pago, por favor. Push: " + error.message);
    }
  };

  const handleItemPress = useCallback((itemId) => {
    const item = dataMapRef.current.get(itemId);
    if (item) {
      setSelectedServicio(item);
      setShowServicioModal(true);
    }
  }, []);

  const closeModal = useCallback(() => {
    setShowServicioModal(false);
  }, []);

  const accesosBtnPressed = useCallback(() => {
    trackEvent("admin_section_open", {
      escuela: currentEscuelaRef.current ? currentEscuelaRef.current.id : "",
      section: "accesos"
    });
    navigation.navigate("AccesosHistorial");
  }, [navigation]);

  const pagosBtnPressed = useCallback(() => {
    trackEvent("admin_section_open", {
      escuela: currentEscuelaRef.current ? currentEscuelaRef.current.id : "",
      section: "edoCuenta"
    });
    navigation.navigate("EdoCuenta");
  }, [navigation]);

  const serviciosBtnPressed = useCallback(() => {
    trackEvent("admin_section_open", {
      escuela: currentEscuelaRef.current ? currentEscuelaRef.current.id : "",
      section: "servicios"
    });
    navigation.navigate("ServiciosHistorial");
  }, [navigation]);

  const facturacionBtnPressed = useCallback(() => {
    trackEvent("admin_section_open", {
      escuela: currentEscuelaRef.current ? currentEscuelaRef.current.id : "",
      section: "facturacion"
    });
    navigation.navigate("FacturasList", {
      escuelaId: currentEscuelaRef.current?.id,
      estudiantes: estudiantesDataRef.current
    });
  }, [navigation]);

  const presentFeedback = (alertTitle, alertMessage) => {
    Alert.alert(
      alertTitle,
      alertMessage,
      [{ text: 'Ok', onPress: null, style: 'default' }],
      { cancelable: false },
    );
  };

  // Memoized renderItem function
  const renderItem = useCallback(({ item }) => {
    return (
      <ServicioItem
        id={item.id}
        nombre={item.nombre}
        precio={item.precio}
        onPress={handleItemPress}
      />
    );
  }, [handleItemPress]);

  // Stable keyExtractor using unique ID
  const keyExtractor = useCallback((item) => item.id, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <View style={styles.container}>
          <ScrollView contentContainerStyle={styles.contentContainer}>
            <View>
              <Text style={styles.titleText}>Administración</Text>
            </View>
            <View style={styles.dividerView} />

            {showServicioModal && (
              <View style={styles.servicioModal}>
                <Pressable onPress={closeModal}>
                  <Text style={styles.backBtnText}>Cerrar</Text>
                </Pressable>
                <View style={styles.modalCenterContent}>
                  <Text style={styles.modalTitle}>{selectedServicio?.nombre}</Text>
                  <Text style={styles.modalSubtitle}>{selectedServicio?.descripcion}</Text>
                </View>
                <View style={styles.modalRow}>
                  <Text style={styles.modalLabels}>Para:</Text>
                  {hasMultipleChildren && (
                    <Pressable onPress={cambiarEstudianteIndex}>
                      <Text style={styles.modalActionBtn}>Cambiar</Text>
                    </Pressable>
                  )}
                </View>
                <View style={styles.modalCenterContent}>
                  <TextInput style={styles.whiteTextField} value={currentEstudianteNombre} editable={false} />
                </View>

                <View style={styles.modalRow}>
                  <Text style={styles.modalLabels}>Fecha:</Text>
                  <Pressable onPress={cambiarFechaBtnPressed}>
                    <Text style={styles.modalActionBtn}>Cambiar</Text>
                  </Pressable>
                </View>
                <View style={styles.modalCenterContent}>
                  <TextInput style={styles.whiteTextField} value={dateString} editable={false} />
                  <DateTimePicker
                    isVisible={isDateTimePickerVisible}
                    onConfirm={handleDatePicked}
                    onCancel={hideDateTimePicker}
                  />
                  <Text style={styles.modalLabels}>Comentarios:</Text>
                  <TextInput
                    style={styles.textView}
                    multiline={true}
                    onChangeText={setServicioSolicitadoComentarios}
                    dataDetectorTypes={'link'}
                  />

                  <View style={styles.totalRow}>
                    <Text style={styles.totalLabel}>Total:</Text>
                    <Text style={styles.modalTitle}>{selectedServicio?.precio}</Text>
                  </View>

                  {isLoadingModal ? (
                    <ActivityIndicator size="large" color="#ffff" animating={isLoadingModal} style={styles.modalLoading} hidesWhenStopped={true} />
                  ) : (
                    <Pressable style={styles.modalFinalActionBtn} onPress={solicitarServicioBtnPressed}>
                      <Text style={styles.buttonText}>Solicitar servicio</Text>
                    </Pressable>
                  )}
                </View>
              </View>
            )}

            <Pressable onPress={accesosBtnPressed} style={styles.accesosBtn}>
              <Text style={styles.buttonText}>Accesos</Text>
            </Pressable>
            <Pressable onPress={pagosBtnPressed} style={styles.pagosBtn}>
              <Text style={styles.buttonText}>Pagos</Text>
            </Pressable>
            <Pressable onPress={facturacionBtnPressed} style={styles.facturacionBtn}>
              <Text style={styles.buttonText}>Facturación</Text>
            </Pressable>

            {mostrarServicios ? (
              <View style={styles.serviciosContainer}>
                <Pressable onPress={serviciosBtnPressed} style={styles.serviciosBtn}>
                  <Text style={styles.buttonText}>Servicios solicitados</Text>
                </Pressable>

                <View style={styles.solicitarServiciosContainerView}>
                  <Text style={styles.subtitleText}>Solicita servicios adicionales para tu hijo:</Text>
                  {hasData ? (
                    <View style={styles.listWrapper}>
                      <FlashList
                        data={data}
                        renderItem={renderItem}
                        keyExtractor={keyExtractor}
                        estimatedItemSize={50}
                        contentContainerStyle={styles.flatlistContent}
                      />
                    </View>
                  ) : (
                    <View style={styles.emptyStateView}>
                      <Text>Aquí van a aparecer servicios que tu Escuela quiera ofrecer.</Text>
                    </View>
                  )}
                </View>
              </View>
            ) : (
              <ExpoImage
                source={require('../assets/escuelaIcon/mtToluca.png')}
                style={styles.escuelaLogoImg}
                contentFit="contain"
              />
            )}
          </ScrollView>
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.bluejeansDark
  },
  header: {
    flex: 1,
    backgroundColor: Colors.bluejeansDark,
    paddingTop: Platform.OS === 'ios' ? 8 : 28,
    paddingLeft: 8,
    paddingRight: 8
  },
  container: {
    flex: 1,
    paddingTop: 8,
    backgroundColor: Colors.bluejeansDark,
  },
  contentContainer: {
    backgroundColor: Colors.bluejeansDark,
    alignItems: 'center',
  },
  listWrapper: {
    backgroundColor: 'white',
    width: screenWidth - 16,
    minHeight: 100,
    borderRadius: 6,
  },
  flatlistContent: {
    padding: 8,
  },
  subtitleText: {
    color: 'white',
    fontSize: 17,
    fontWeight: '400',
    marginBottom: 8
  },
  backBtnText: {
    color: Colors.actionColor,
    fontWeight: '500',
    marginTop: 4,
    marginBottom: 8,
    marginLeft: 8
  },
  titleText: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8
  },
  buttonText: {
    color: 'white',
    fontSize: 20,
    fontWeight: '600'
  },
  accesosBtn: {
    backgroundColor: Colors.bittersweetLight,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 16,
    marginBottom: 14,
    borderRadius: 8,
    width: '94%',
  },
  pagosBtn: {
    backgroundColor: Colors.grassLight,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    borderRadius: 8,
    width: '94%',
  },
  serviciosContainer: {
    flex: 1,
    width: screenWidth - 13,
    alignItems: 'center',
  },
  serviciosBtn: {
    backgroundColor: Colors.pinkroseDark,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
    borderRadius: 8,
    width: '94%',
  },
  facturacionBtn: {
    backgroundColor: Colors.lavanderDark,
    height: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 14,
    borderRadius: 8,
    width: '94%',
  },
  solicitarServiciosContainerView: {
    alignItems: 'center'
  },
  servicioCard: {
    backgroundColor: Colors.pinkroseDark,
    padding: 8,
    margin: 8,
    borderRadius: 8
  },
  servicioCardContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  servicioNombreText: {
    color: 'white',
    fontWeight: '600',
  },
  servicioPrecioText: {
    color: 'white',
    fontWeight: '400',
    marginLeft: 8,
  },
  dividerView: {
    height: 2,
    backgroundColor: Colors.aquaDark,
    marginTop: 4,
    width: '96%',
  },
  servicioModal: {
    position: 'absolute',
    zIndex: 5,
    shadowOffset: { width: 8, height: 8 },
    shadowColor: Colors.darkGrayLight,
    shadowOpacity: 0.8,
    elevation: 1,
    height: '70%',
    width: '85%',
    borderRadius: 8,
    backgroundColor: Colors.aquaDark,
    marginTop: 2,
  },
  modalCenterContent: {
    alignItems: 'center',
  },
  whiteTextField: {
    marginBottom: 12,
    backgroundColor: '#fff',
    paddingLeft: 4,
    height: 28,
    color: Colors.darkGrayDark,
    width: '85%',
    textAlign: 'center',
    borderRadius: 5,
  },
  textView: {
    height: 90,
    width: "85%",
    backgroundColor: 'white',
    padding: 8,
    marginBottom: 12,
    borderRadius: 5,
    textAlignVertical: 'top',
  },
  modalLabels: {
    color: 'white'
  },
  modalActionBtn: {
    color: Colors.actionColor,
    fontWeight: '400',
  },
  modalTitle: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16
  },
  modalSubtitle: {
    color: 'white',
    fontWeight: '400',
    marginBottom: 12
  },
  modalRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginLeft: 20,
    marginRight: 20,
    marginBottom: 2
  },
  totalRow: {
    flexDirection: 'row',
    justifyContent: 'center',
  },
  totalLabel: {
    color: 'white',
    marginRight: 4,
  },
  modalLoading: {
    marginTop: 4,
  },
  modalFinalActionBtn: {
    backgroundColor: Colors.pinkroseDark,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
    borderRadius: 8,
    width: '90%',
    marginTop: 12
  },
  emptyStateView: {
    backgroundColor: 'white',
    width: screenWidth - 16,
    padding: 8,
    borderRadius: 6,
    height: 100,
    justifyContent: 'center',
    alignItems: 'center'
  },
  escuelaLogoImg: {
    height: 150,
    width: screenWidth - 32,
    marginTop: 80
  },
});