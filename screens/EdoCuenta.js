import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import { trackEvent } from "@aptabase/react-native";
var Parse = require('parse/react-native');
import Colors from '../constants/Colors';
import dayjs from '../utils/dayjs';
import {
  SafeAreaView,
  Platform,
  StyleSheet,
  ActivityIndicator,
  Text,
  DeviceEventEmitter,
  Pressable,
  View,
  Dimensions,
  Alert,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Image as ExpoImage } from 'expo-image';

const screenWidth = Dimensions.get('window').width;

// Memoized list item component - pass primitives for effective memoization
const PagoItem = memo(function PagoItem({
  id,
  concepto,
  cantidad,
  estudiante,
  timestamp,
  status,
  hasAttachment,
  hasRecibo,
  paidWithStripe,
  stripeChargeAmount,
  onPress,
}) {
  const handlePress = useCallback(() => {
    onPress(id);
  }, [id, onPress]);

  const isPagado = status === 'Pagado';

  return (
    <Pressable onPress={handlePress}>
      <View style={styles.listCard}>
        <Text style={styles.conceptoText}>{concepto}</Text>
        <View style={styles.rowView}>
          <Text style={styles.cardText}>{"$" + cantidad}</Text>
          {paidWithStripe ? (
            <Text style={styles.cardText}>Cargo tarj: ${stripeChargeAmount}</Text>
          ) : null}
        </View>
        <View style={styles.rowView}>
          <Text style={styles.cardText}>{estudiante}</Text>
          {hasAttachment ? (
            <ExpoImage
              style={styles.attachmentImage}
              source={require('../assets/images/attachmentIconBlack.png')}
              contentFit="contain"
            />
          ) : null}
          {hasRecibo ? (
            <ExpoImage
              style={styles.reciboImage}
              source={require('../assets/images/reciboEmitidoIcon.png')}
              contentFit="contain"
            />
          ) : null}
        </View>
        <View style={styles.rowView}>
          <Text style={styles.cardText}>{timestamp}</Text>
          <Text style={isPagado ? styles.statusPagado : styles.statusPendiente}>
            {status}
          </Text>
          {!isPagado ? (
            <Text style={styles.pendienteArrow}>{" >"}</Text>
          ) : null}
        </View>
      </View>
    </Pressable>
  );
});

export default function EdoCuenta({ navigation }) {
  // State
  const [isLoading, setIsLoading] = useState(true);
  const [data, setData] = useState([]);
  const [adeudoTotal, setAdeudoTotal] = useState("0.0");
  const [hasData, setHasData] = useState(true);
  const [stripeConfig, setStripeConfig] = useState({
    isStripeActive: false,
    stripeCommissionPercent: 0.0,
    stripeConnectAccntId: "",
  });

  // Refs
  const currentUserRef = useRef(null);
  const dataMapRef = useRef(new Map());

  // Navigation options
  EdoCuenta.navigationOptions = {
    header: null,
  };

  // Initialize on mount and setup event listener
  useEffect(() => {
    initializeScreen();

    // Listen to refresh event
    const subscription = DeviceEventEmitter.addListener(
      "refreshEdoCuentaList",
      () => refreshEdoCuentaList()
    );

    // Cleanup on unmount
    return () => {
      subscription.remove();
    };
  }, []);

  const initializeScreen = async () => {
    try {
      const user = await Parse.User.currentAsync();
      if (user) {
        currentUserRef.current = user;
        const escuela = user.get('escuela');

        const isStripeActive = escuela.get('isStripeActive');
        const stripeCommissionPercent = escuela.get('stripeCommissionPercent');
        const stripeConnectAccntId = escuela.get('stripeConnectAccntId') || "";

        console.log("**stripeConnectAccntId: " + stripeConnectAccntId);

        if (isStripeActive && stripeConnectAccntId.length > 0) {
          setStripeConfig({
            isStripeActive,
            stripeCommissionPercent,
            stripeConnectAccntId,
          });
        }

        await retrievePagosHistorial(user);
      }
    } catch (error) {
      console.log("Error initializing screen:", error);
      setIsLoading(false);
    }
  };

  const retrievePagosHistorial = async (user) => {
    try {
      // Estudiantes Query
      const Estudiantes = Parse.Object.extend("Estudiantes");
      const queryEstudiantes = new Parse.Query(Estudiantes);
      queryEstudiantes.equalTo("PersonasAutorizadas", user);

      // Query Pagos Recurrentes
      const endOfMonth = dayjs().endOf("month").toDate();
      const Pago = Parse.Object.extend("pagos");

      const queryPagoRecurrente = new Parse.Query(Pago);
      queryPagoRecurrente.matchesQuery("student", queryEstudiantes);
      queryPagoRecurrente.exists("fechaCobro");
      queryPagoRecurrente.lessThanOrEqualTo("fechaCobro", endOfMonth);

      // Query pagos normales
      const queryPagos = new Parse.Query(Pago);
      queryPagos.matchesQuery("student", queryEstudiantes);
      queryPagos.doesNotExist('fechaCobro');

      // OR Query for SubQuery
      const mainQuery = Parse.Query.or(queryPagoRecurrente, queryPagos);
      mainQuery.descending("createdAt");
      mainQuery.include('user');
      mainQuery.include('student');

      const pagos = await mainQuery.find();

      if (pagos.length === 0) {
        setHasData(false);
        setIsLoading(false);
        return;
      }

      let adeudoTotalCount = 0;
      const dataArr = [];
      const newDataMap = new Map();

      for (let i = 0; i < pagos.length; i++) {
        const object = pagos[i];
        const studentObj = object.get('student');
        const conceptoString = object.get('concepto');
        const estudianteNombreString = studentObj.get('NOMBRE');

        let pagoAmount = "0.0";
        if (object.get('total') != null) {
          pagoAmount = object.get('total');
        }

        let fechaString = "";
        if (object.get('fechaCobro')) {
          fechaString = dayjs(object.get('fechaCobro')).format("DD/MMM/YY");
        } else {
          fechaString = dayjs(object.createdAt).format("DD/MMM/YY");
        }

        let statusString = "Pendiente";
        if (object.get('pagado')) {
          statusString = "Pagado";
        } else {
          if (object.get('total')) {
            adeudoTotalCount = adeudoTotalCount + object.get('total');
          }
        }

        const pagoHasAttachment = object.get('aws') === true || object.get('newS3Bucket') === true;

        let reciboEmitido = false;
        let folioReciboString = "";
        if (object.get('folioRecibo')) {
          reciboEmitido = true;
          folioReciboString = object.get('folioRecibo');
        }

        const paidWithStripe = !!object.get('stripeChargeId');
        let stripeChargeAmount = 0;
        if (object.get('stripeChargeAmount')) {
          stripeChargeAmount = object.get('stripeChargeAmount') / 100;
        }

        const itemData = {
          id: object.id,
          concepto: conceptoString,
          estudiante: estudianteNombreString,
          timestamp: fechaString,
          cantidad: pagoAmount,
          status: statusString,
          hasAttachment: pagoHasAttachment,
          isNewBucket: object.get('newS3Bucket'),
          hasRecibo: reciboEmitido,
          folioRecibo: folioReciboString,
          paidWithStripe: paidWithStripe,
          stripeChargeAmount: stripeChargeAmount,
        };

        dataArr.push(itemData);
        newDataMap.set(object.id, itemData);
      }

      dataMapRef.current = newDataMap;
      setData(dataArr);
      setAdeudoTotal(adeudoTotalCount);
      setIsLoading(false);
    } catch (error) {
      console.log("EdoCuenta ERROR: " + JSON.stringify(error));
      setIsLoading(false);
      presentFeedback("Algo salió mal", "No fue posible traer la información de pagos. Intenta de nuevo, por favor.");
    }
  };

  const refreshEdoCuentaList = useCallback(() => {
    console.log("**refreshEdoCuentaList");
    if (currentUserRef.current) {
      retrievePagosHistorial(currentUserRef.current);
    }
  }, []);

  const handleItemPress = useCallback((itemId) => {
    const item = dataMapRef.current.get(itemId);
    if (item) {
      trackEvent("pago_view", {
        escuela: currentUserRef.current?.get('escuela')?.id || "",
        studentId: item.estudiante || ""
      });
      navigation.navigate("PagoDetail", {
        stripeConnectAccntId: stripeConfig.stripeConnectAccntId,
        isStripeActive: stripeConfig.isStripeActive,
        stripeCommissionPercent: stripeConfig.stripeCommissionPercent,
        pagoObj: item
      });
    }
  }, [navigation, stripeConfig]);

  const backBtnPressed = useCallback(() => {
    navigation.goBack();
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
      <PagoItem
        id={item.id}
        concepto={item.concepto}
        cantidad={item.cantidad}
        estudiante={item.estudiante}
        timestamp={item.timestamp}
        status={item.status}
        hasAttachment={item.hasAttachment}
        hasRecibo={item.hasRecibo}
        paidWithStripe={item.paidWithStripe}
        stripeChargeAmount={item.stripeChargeAmount}
        onPress={handleItemPress}
      />
    );
  }, [handleItemPress]);

  // Stable keyExtractor using unique ID
  const keyExtractor = useCallback((item) => item.id, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Pressable onPress={backBtnPressed}>
            <Text style={styles.headerBtnText}>{"< Atrás"}</Text>
          </Pressable>
        </View>
        <View style={styles.dividerView} />
        <View style={styles.container}>
          <View style={styles.titleContainer}>
            <Text style={styles.titleText}>Estado de Cuenta</Text>
          </View>
          <View style={styles.adeudoView}>
            <Text style={styles.adeudoLabel}>Adeudo total:</Text>
            <Text style={styles.adeudoAmount}>{" $" + adeudoTotal}</Text>
          </View>
          {isLoading ? (
            <ActivityIndicator
              size="large"
              color="#ffff"
              animating={isLoading}
              style={styles.loadingIndicator}
              hidesWhenStopped={true}
            />
          ) : hasData ? (
            <View style={styles.listWrapper}>
              <FlashList
                data={data}
                renderItem={renderItem}
                keyExtractor={keyExtractor}
                estimatedItemSize={120}
                contentContainerStyle={styles.listContent}
              />
            </View>
          ) : (
            <View style={styles.emptyStateView}>
              <Text style={styles.emptyStateText}>
                Aquí va a aparecer tu historial de pagos y estado de cuenta. Por ahora no hay pagos.
              </Text>
              <ExpoImage
                source={require('../assets/images/Pepi.png')}
                style={styles.emptyStateLogoImg}
                contentFit="contain"
              />
            </View>
          )}
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.aquaLight
  },
  header: {
    flex: 1,
    backgroundColor: Colors.aquaLight,
    paddingTop: Platform.OS === 'ios' ? 8 : 28,
    paddingLeft: 8,
    paddingRight: 8
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  dividerView: {
    height: 2,
    backgroundColor: Colors.aquaDark,
    marginTop: 4
  },
  headerBtnText: {
    color: Colors.actionColor,
    fontWeight: '700'
  },
  rowView: {
    flexDirection: 'row',
    justifyContent: 'space-between'
  },
  adeudoView: {
    backgroundColor: Colors.aquaDark,
    flexDirection: 'row',
    marginBottom: 10,
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: 8,
    padding: 4
  },
  adeudoLabel: {
    color: 'white',
    fontSize: 18,
    fontWeight: '400',
  },
  adeudoAmount: {
    color: 'white',
    fontSize: 18,
    fontWeight: '700',
    marginLeft: 2,
  },
  listCard: {
    backgroundColor: 'white',
    padding: 8,
    borderRadius: 8,
    marginBottom: 8
  },
  conceptoText: {
    color: Colors.darkGrayDark,
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 6,
  },
  container: {
    flex: 1,
    paddingTop: 8,
    backgroundColor: Colors.aquaLight,
  },
  titleContainer: {
    alignItems: 'center',
  },
  titleText: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8
  },
  loadingIndicator: {
    margin: 8,
  },
  listWrapper: {
    flex: 1,
  },
  listContent: {
    backgroundColor: Colors.aquaLight,
  },
  cardText: {
    color: Colors.darkGrayDark,
    fontWeight: '500',
    marginBottom: 6
  },
  statusPagado: {
    color: Colors.grassDark,
    fontWeight: '500',
    marginBottom: 6,
  },
  statusPendiente: {
    color: Colors.bittersweetLight,
    fontWeight: '800',
    marginBottom: 6,
  },
  pendienteArrow: {
    color: Colors.bittersweetLight,
    fontWeight: '800',
    marginBottom: 6,
  },
  attachmentImage: {
    height: 22,
    width: 22,
    marginBottom: 8
  },
  reciboImage: {
    height: 18,
    width: 18,
    marginBottom: 8
  },
  emptyStateText: {
    color: 'white',
    fontWeight: '700'
  },
  emptyStateLogoImg: {
    height: 80,
    width: 80,
    marginTop: 40
  },
  emptyStateView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 16
  }
});