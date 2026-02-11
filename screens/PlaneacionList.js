import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import { trackEvent } from "@aptabase/react-native";
var Parse = require('parse/react-native');
import Colors from '../constants/Colors';
import {
  SafeAreaView,
  Platform,
  StyleSheet,
  Text,
  Pressable,
  View,
  Alert,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import dayjs from '../utils/dayjs';

const PLACEHOLDER_DESCRIPCION = "Actividad por planear";

// Memoized list item component - pass primitives for effective memoization
const PlanItem = memo(function PlanItem({
  dayCode,
  numero,
  mes,
  nombre,
  planCount,
  dayOfWeek,
  onPress,
}) {
  const handlePress = useCallback(() => {
    onPress(dayCode);
  }, [dayCode, onPress]);

  return (
    <>
      <Pressable style={styles.row} onPress={handlePress}>
        <View style={styles.rowContent}>
          <View style={styles.listCard}>
            <Text style={styles.listNumeroText}>{numero}</Text>
            <Text style={styles.listMesText}>{mes}</Text>
          </View>
          <View style={styles.planInfoContainer}>
            <Text style={styles.listDayName}>{nombre}</Text>
            <Text style={styles.actividadCount}>
              {planCount === 0 ? "Sin Plan" : "Actividades: " + planCount}
            </Text>
          </View>
        </View>
      </Pressable>
      {dayOfWeek === 5 && <View style={styles.weekSeparator} />}
    </>
  );
});

export default function PlaneacionList({ route, navigation }) {
  // Navigation params
  const estudianteObjId = route.params.estudianteObjId;

  // State
  const [data, setData] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [grupoNombre, setGrupoNombre] = useState("");

  // Refs
  const currentUserRef = useRef(new Parse.User());
  const dataMapRef = useRef(new Map()); // Store full item data for navigation

  // Navigation options
  PlaneacionList.navigationOptions = {
    header: null,
  };

  // Initialize on mount
  useEffect(() => {
    getCurrentGrupo();
  }, []);

  const initTableData = () => {
    const workDays = [];
    const day = new Date();
    const newDataMap = new Map();

    while (workDays.length < 10) {
      const dayOfWeek = day.getDay();
      const fechaId = dayjs(day).format("DD-MM-YYYY");
      const diaNombreString = dayjs(day).format('dddd');
      const diaNumeroString = dayjs(day).format('DD');
      const diaMesString = dayjs(day).format('MMMM');
      const diaCode = dayjs(day).format('DDMM');

      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        const itemData = {
          date: dayjs(day).format("DD MMMM"),
          dayObj: fechaId,
          planCount: 0,
          planObjects: null,
          dayOfWeek,
          nombre: diaNombreString,
          numero: diaNumeroString,
          mes: diaMesString,
          titulo: PLACEHOLDER_DESCRIPCION,
          dayCode: diaCode,
          objectId: null
        };

        workDays.push(itemData);
        newDataMap.set(diaCode, itemData);
      }
      day.setDate(day.getDate() + 1);
    }

    dataMapRef.current = newDataMap;
    setData(workDays);
  };

  const getCurrentGrupo = async () => {
    try {
      const Estudiante = Parse.Object.extend("Estudiantes");
      const query = new Parse.Query(Estudiante);
      query.include('grupo');
      const estudiante = await query.get(estudianteObjId);

      const grupo = estudiante.get('grupo');
      const grupoName = grupo.get('name');
      setGrupoNombre(grupoName);

      await fetchPlaneacion(grupo);
    } catch (error) {
      console.log("Error getting grupo:", error);
      presentFeedback("Algo salio mal", "No fue posible traer la informacion de grupo. Intenta de nuevo, por favor.");
    }
  };

  const fetchPlaneacion = async (grupoObj) => {
    try {
      const startDate = dayjs().day(1).startOf('day').toDate();
      const Planeacion = Parse.Object.extend("Planeacion");
      const query = new Parse.Query(Planeacion);
      query.equalTo("grupo", grupoObj);
      query.greaterThanOrEqualTo("fecha", startDate);
      query.ascending("fecha");

      const planeacion = await query.find();
      processData(planeacion);
    } catch (error) {
      console.log("Error fetching planeacion:", error);
      presentFeedback("Algo salio mal", "No fue posible traer la informacion de las actividades. Intenta de nuevo, por favor.");
    }
  };

  const processData = (dataArr) => {
    const dataLength = dataArr.length;
    if (dataLength === 0) {
      initTableData();
      return;
    }

    // Process server data
    const dayPlanCount = {};
    const dayPlanObjects = {};

    for (let j = 0; j < dataLength; j++) {
      const object = dataArr[j];
      const fecha = object.get('fecha');
      const fechaId = dayjs(fecha).format("DD-MM-YYYY");

      if (!dayPlanCount[fechaId]) {
        dayPlanCount[fechaId] = 1;
      } else {
        dayPlanCount[fechaId]++;
      }

      let actividadCount = "1";
      if (dayPlanObjects[fechaId] != null) {
        const objectsCount = dayPlanObjects[fechaId].length + 1;
        actividadCount = "" + objectsCount;
      }

      const actividadObj = {
        id: object.id,
        key: 'Actividad ' + actividadCount,
        titulo: object.get('titulo'),
        tema: object.get('tema'),
        habitos: object.get('habitos'),
        valores: object.get('valores'),
        descripcion: object.get('descripcion'),
        notas: object.get('notas')
      };

      if (!dayPlanObjects[fechaId]) {
        dayPlanObjects[fechaId] = [actividadObj];
      } else {
        dayPlanObjects[fechaId].push(actividadObj);
      }
    }

    // Build work days
    const workDays = [];
    const day = new Date();
    const newDataMap = new Map();

    while (workDays.length < 10) {
      const dayOfWeek = day.getDay();
      const fechaId = dayjs(day).format("DD-MM-YYYY");
      const diaNombreString = dayjs(day).format('dddd');
      const diaNumeroString = dayjs(day).format('DD');
      const diaMesString = dayjs(day).format('MMMM');
      const diaCode = dayjs(day).format('DDMM');

      let planCount = 0;
      if (dayPlanCount[fechaId] != null) {
        planCount = dayPlanCount[fechaId];
      }

      if (dayOfWeek !== 0 && dayOfWeek !== 6) {
        const itemData = {
          date: dayjs(day).format("DD MMMM"),
          dayObj: fechaId,
          planCount: planCount,
          planObjects: dayPlanObjects[fechaId] || null,
          dayOfWeek,
          nombre: diaNombreString,
          numero: diaNumeroString,
          mes: diaMesString,
          titulo: PLACEHOLDER_DESCRIPCION,
          dayCode: diaCode,
          objectId: ""
        };

        workDays.push(itemData);
        newDataMap.set(diaCode, itemData);
      }
      day.setDate(day.getDate() + 1);
    }

    dataMapRef.current = newDataMap;
    setData(workDays);
  };

  const backBtnPressed = useCallback(() => {
    navigation.goBack();
  }, [navigation]);

  // Stable callback for item press - hoisted to root
  const handleItemPress = useCallback((dayCode) => {
    const item = dataMapRef.current.get(dayCode);
    if (item) {
      if (item.planCount > 0) {
        navigation.navigate('PlaneacionDetail', { planeacionObj: item, grupo: grupoNombre });
      } else {
        presentFeedback("Actividad vacia", "No hay detalles disponibles para este dia.");
      }
    }
  }, [navigation, grupoNombre]);

  const presentFeedback = (alertTitle, alertMessage, isFinal = false) => {
    const options = [];
    const params = isFinal
      ? { text: 'Ok', onPress: () => navigation.goBack(), style: 'default' }
      : { text: 'Ok', onPress: null, style: 'default' };

    options.push(params);

    Alert.alert(
      alertTitle,
      alertMessage,
      options,
      { cancelable: false },
    );
  };

  // Memoized renderItem function
  const renderItem = useCallback(({ item }) => {
    return (
      <PlanItem
        dayCode={item.dayCode}
        numero={item.numero}
        mes={item.mes}
        nombre={item.nombre}
        planCount={item.planCount}
        dayOfWeek={item.dayOfWeek}
        onPress={handleItemPress}
      />
    );
  }, [handleItemPress]);

  // Stable keyExtractor using unique dayCode instead of index
  const keyExtractor = useCallback((item) => item.dayCode, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          <Pressable onPress={backBtnPressed}>
            <Text style={styles.backBtnText}>{"< Atras"}</Text>
          </Pressable>
          <Text style={styles.titleText}>Planeacion</Text>
          <Text style={styles.subtitleText}>{grupoNombre}</Text>
        </View>

        <View style={styles.dividerView} />

        <View style={styles.container}>
          <FlashList
            data={data}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            estimatedItemSize={90}
            contentContainerStyle={styles.tableViewContent}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.sunflowerDark
  },
  header: {
    flex: 1,
    backgroundColor: Colors.sunflowerDark,
    paddingTop: Platform.OS === 'ios' ? 8 : 28,
    paddingLeft: 8,
    paddingRight: 8
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: "space-between",
    alignItems: 'center'
  },
  backBtnText: {
    color: Colors.actionColor,
    fontWeight: '700',
    width: 90,
  },
  dividerView: {
    height: 2,
    backgroundColor: Colors.sunflowerLight,
    marginTop: 2
  },
  container: {
    flex: 1,
    paddingTop: 8,
    backgroundColor: Colors.sunflowerDark,
  },
  contentContainer: {
    backgroundColor: Colors.sunflowerDark,
  },
  tableViewContent: {
    backgroundColor: Colors.sunflowerClear,
    borderRadius: 12,
  },
  row: {
    borderBottomWidth: 1,
    borderBottomColor: '#ddd',
  },
  rowContent: {
    flexDirection: 'row'
  },
  listCard: {
    padding: 8,
    width: 100,
    marginBottom: 2
  },
  planInfoContainer: {
    flex: 1,
    justifyContent: "space-between",
    paddingVertical: 12
  },
  titleText: {
    color: Colors.darkGrayDark,
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8
  },
  subtitleText: {
    color: Colors.darkGrayDark,
    fontSize: 20,
    fontWeight: '500',
    marginBottom: 8
  },
  listNumeroText: {
    color: Colors.darkGrayDark,
    fontSize: 32,
    fontWeight: '800',
    marginBottom: 4
  },
  listMesText: {
    color: Colors.darkGrayDark,
    fontSize: 14,
    fontWeight: '400',
    marginBottom: 4
  },
  listDayName: {
    color: Colors.darkGrayLight,
    fontSize: 18,
  },
  listDescripcionText: {
    color: Colors.darkGrayDark,
    fontSize: 18,
  },
  actividadCount: {
    width: 150,
    fontSize: 22,
    color: Colors.darkGrayDark,
  },
  weekSeparator: {
    height: 5,
    backgroundColor: Colors.sunflowerLight
  },
});
