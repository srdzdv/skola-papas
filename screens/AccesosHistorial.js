import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import { trackEvent } from "@aptabase/react-native";
var Parse = require('parse/react-native');
import Colors from '../constants/Colors';
import dayjs from '../utils/dayjs';
import {
  Platform,
  StyleSheet,
  Text,
  Pressable,
  View,
  Dimensions,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { Image as ExpoImage } from 'expo-image';

const screenWidth = Dimensions.get('window').width;

// Memoized list item component - pass primitives for effective memoization
const AccesoItem = memo(function AccesoItem({
  id,
  datePart,
  timePart,
  puntualidad,
  estudiante,
  personaAutorizada,
  parentesco,
}) {
  return (
    <View style={styles.listCard}>
      <View style={styles.cardHeader}>
        <View style={styles.dateTimeContainer}>
          <Text style={styles.dateText}>{datePart}</Text>
          <Text style={styles.timeText}>{timePart}</Text>
        </View>
        {puntualidad ? (
          <View style={styles.puntualidadBadge}>
            <Text style={styles.puntualidadText}>{puntualidad}</Text>
          </View>
        ) : null}
      </View>
      <View style={styles.contentRow}>
        <View style={styles.leftColumn}>
          <Text style={styles.alumnoLabel}>Alumno</Text>
          <Text style={styles.alumnoText}>{estudiante}</Text>
        </View>
        <View style={styles.rightColumn}>
          <Text style={styles.personaLabel}>Persona Autorizada</Text>
          <Text style={styles.personaText}>{personaAutorizada}</Text>
          {parentesco ? (
            <Text style={styles.parentescoText}>{parentesco}</Text>
          ) : null}
        </View>
      </View>
    </View>
  );
});

export default function AccesosHistorial({ navigation }) {
  // State
  const [isLoading, setIsLoading] = useState(true);
  const [hasData, setHasData] = useState(true);
  const [data, setData] = useState([]);

  // Refs
  const currentUserRef = useRef(null);

  // Navigation options
  AccesosHistorial.navigationOptions = {
    header: null,
  };

  // Initialize on mount
  useEffect(() => {
    initializeScreen();
  }, []);

  const initializeScreen = async () => {
    try {
      const user = await Parse.User.currentAsync();
      if (user) {
        currentUserRef.current = user;
        await retrieveAccesosHistorial(user);
      }
    } catch (error) {
      console.log("Error initializing screen:", error);
      setIsLoading(false);
    }
  };

  const getPuntualidadString = (puntualidadInt) => {
    switch (puntualidadInt) {
      case 0:
        return "A Tiempo";
      case 1:
        return "Tolerancia";
      case 2:
        return "Tarde";
      case -1:
        return "Temprano";
      default:
        return "";
    }
  };

  const retrieveAccesosHistorial = async (user) => {
    try {
      // Estudiantes Query
      const Estudiantes = Parse.Object.extend("Estudiantes");
      const queryEstudiantes = new Parse.Query(Estudiantes);
      queryEstudiantes.equalTo("PersonasAutorizadas", user);

      // Query
      const Acceso = Parse.Object.extend("Acceso");
      const query = new Parse.Query(Acceso);
      query.matchesQuery("student", queryEstudiantes);
      query.include("user");
      query.include("student");
      query.limit(60);
      query.descending("createdAt");

      const accesos = await query.find();

      if (accesos.length === 0) {
        setHasData(false);
        setIsLoading(false);
        return;
      }

      console.log("AccesosHistorial count: " + accesos.length);

      const dataArr = accesos.map((object, index) => {
        const userObj = object.get('user');
        const studentObj = object.get('student');

        const puntualidadString = getPuntualidadString(object.get('puntualidad'));

        let personaAutorizadaString = "Usuario";
        let parentescoString = "";
        if (userObj) {
          personaAutorizadaString = (userObj.get('nombre') || '') + " " + (userObj.get('apellidos') || '');
          parentescoString = userObj.get('parentesco') || "";
        }

        const estudianteNombre = studentObj.get('NOMBRE') || '';
        const fechaString = dayjs(object.createdAt).format("dddd DD/MMM/YY  HH:mm");
        const timestampParts = fechaString.split('  ');

        return {
          id: object.id || `acceso-${index}`,
          personaAutorizada: personaAutorizadaString,
          parentesco: parentescoString,
          datePart: timestampParts[0] || '',
          timePart: timestampParts[1] || '',
          puntualidad: puntualidadString,
          estudiante: estudianteNombre,
        };
      });

      setData(dataArr);
      setIsLoading(false);
    } catch (error) {
      console.log("Error retrieving accesos:", error);
      setIsLoading(false);
      presentFeedback("Algo salió mal", "No fue posible traer la información de accesos. Intenta de nuevo, por favor.");
    }
  };

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
      <AccesoItem
        id={item.id}
        datePart={item.datePart}
        timePart={item.timePart}
        puntualidad={item.puntualidad}
        estudiante={item.estudiante}
        personaAutorizada={item.personaAutorizada}
        parentesco={item.parentesco}
      />
    );
  }, []);

  // Stable keyExtractor using unique ID
  const keyExtractor = useCallback((item) => item.id, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Pressable onPress={backBtnPressed}>
          <Text style={styles.backBtnText}>{"< Atrás"}</Text>
        </Pressable>
        <View style={styles.dividerView} />
        <View style={styles.container}>
          <View style={styles.titleContainer}>
            <Text style={styles.titleText}>Historial de Accesos</Text>
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
                estimatedItemSize={150}
                contentContainerStyle={styles.listContent}
              />
            </View>
          ) : (
            <View style={styles.emptyStateView}>
              <Text style={styles.emptyStateText}>
                Aquí va a aparecer el historial de accesos a la Escuela. Por ahora no hay eventos.
              </Text>
              <ExpoImage
                source={require('../assets/images/Chuchi.png')}
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
    backgroundColor: Colors.lavanderLight
  },
  header: {
    flex: 1,
    backgroundColor: Colors.lavanderLight,
    paddingTop: Platform.OS === 'ios' ? 8 : 28,
    paddingLeft: 8,
    paddingRight: 8
  },
  dividerView: {
    height: 2,
    backgroundColor: Colors.lavanderDark,
    marginTop: 4
  },
  listCard: {
    backgroundColor: 'white',
    padding: 16,
    borderRadius: 12,
    marginBottom: 12,
    marginHorizontal: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
    position: 'relative',
  },
  dateTimeContainer: {
    flex: 1,
    alignItems: 'center',
  },
  dateText: {
    color: Colors.darkGrayDark,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  timeText: {
    color: Colors.darkGrayDark,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 2,
  },
  puntualidadBadge: {
    backgroundColor: Colors.lavanderLight + '40',
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: 12,
    position: 'absolute',
    right: 0,
    top: 0,
  },
  puntualidadText: {
    color: Colors.lavanderDark,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  contentRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  leftColumn: {
    flex: 1,
    paddingRight: 12,
  },
  rightColumn: {
    flex: 1,
    paddingLeft: 12,
    alignItems: 'flex-end',
  },
  alumnoLabel: {
    color: Colors.darkGrayLight,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  alumnoText: {
    color: Colors.darkGrayDark,
    fontSize: 16,
    fontWeight: '600',
  },
  personaLabel: {
    color: Colors.darkGrayLight,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  personaText: {
    color: Colors.darkGrayDark,
    fontSize: 15,
    fontWeight: '500',
    marginBottom: 4,
    textAlign: 'right',
  },
  parentescoText: {
    color: Colors.darkGrayLight,
    fontSize: 13,
    fontWeight: '400',
    textAlign: 'right',
  },
  backBtnText: {
    color: Colors.actionColor,
    fontWeight: '700'
  },
  container: {
    flex: 1,
    paddingTop: 8,
    backgroundColor: Colors.lavanderLight,
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
    backgroundColor: Colors.lavanderLight,
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