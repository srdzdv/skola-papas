import React, { useState, useEffect, useCallback, useRef, memo, useMemo } from 'react';
import { trackEvent } from "@aptabase/react-native";
var Parse = require('parse/react-native');
import Colors from '../constants/Colors';
import dayjs from '../utils/dayjs';
import AsyncStorage from '@react-native-async-storage/async-storage';
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

// Memoized month header component
const MonthHeader = memo(function MonthHeader({ monthKey, monthLabel, count, isExpanded, onToggle }) {
  const handlePress = useCallback(() => {
    onToggle(monthKey);
  }, [monthKey, onToggle]);

  return (
    <Pressable style={styles.monthHeader} onPress={handlePress}>
      <View style={styles.monthHeaderLeft}>
        <Text style={styles.monthHeaderText}>{monthLabel}</Text>
        <View style={styles.monthCountBadge}>
          <Text style={styles.monthCountText}>{count}</Text>
        </View>
      </View>
      <Text style={styles.monthChevron}>{isExpanded ? '▾' : '▸'}</Text>
    </Pressable>
  );
});

// Memoized list item component - pass primitives for effective memoization
const EventCard = memo(function EventCard({
  id,
  nombre,
  fecha,
  hasPhotos,
  publico,
  isRSVPRequired,
  rsvp,
  onPress,
}) {
  const handlePress = useCallback(() => {
    onPress(id);
  }, [id, onPress]);

  const isConfirmed = rsvp === "Confirmada";

  return (
    <Pressable
      style={styles.cardContainer}
      onPress={handlePress}
    >
      <View style={styles.card}>
        {/* Header Row: Date & Photos indicator */}
        <View style={styles.cardHeader}>
          <View style={styles.dateContainer}>
            <Text style={styles.dateText}>{fecha}</Text>
          </View>
          {hasPhotos && (
            <View style={styles.photoBadge}>
              <ExpoImage
                style={styles.photoIcon}
                source={require('../assets/images/attachmentIconWhite.png')}
                contentFit="contain"
                tintColor="white"
              />
              <Text style={styles.photoText}>Fotos</Text>
            </View>
          )}
        </View>

        {/* Event Name */}
        <Text style={styles.eventName}>{nombre}</Text>

        {/* Details Row */}
        <View style={styles.detailsRow}>
          <View style={styles.publicoContainer}>
            <Text style={styles.labelText}>Publico</Text>
            <Text style={styles.publicoText}>{publico}</Text>
          </View>

          {isRSVPRequired && (
            <View style={[
              styles.rsvpBadge,
              isConfirmed ? styles.rsvpBadgeConfirmed : styles.rsvpBadgePending
            ]}>
              <Text style={[
                styles.rsvpText,
                isConfirmed ? styles.rsvpTextConfirmed : styles.rsvpTextPending
              ]}>
                {isConfirmed ? "Confirmado" : "Pendiente"}
              </Text>
            </View>
          )}
        </View>
      </View>
    </Pressable>
  );
});

export default function EventoList({ navigation }) {
  // State
  const [groupedData, setGroupedData] = useState([]);
  const [expandedMonths, setExpandedMonths] = useState(() => new Set([dayjs().format('YYYY-MM')]));
  const [isLoading, setIsLoading] = useState(true);
  const [hasData, setHasData] = useState(true);
  const [isDeepLink, setIsDeepLink] = useState(false);
  const [deepLinkObjId, setDeepLinkObjId] = useState("");

  // Refs
  const currentUserRef = useRef(new Parse.User());
  const currEscuelaRef = useRef(null);
  const userGruposIdsRef = useRef("");
  const gruposObjRef = useRef({});
  const rsvpArrRef = useRef([]);
  const dataMapRef = useRef(new Map()); // Store full item data for navigation

  // Navigation options
  EventoList.navigationOptions = {
    header: null,
  };

  // Derive flat list from grouped data + expanded state
  const flatListData = useMemo(() => {
    const result = [];
    for (const group of groupedData) {
      const isExpanded = expandedMonths.has(group.monthKey);
      result.push({
        type: 'month_header',
        id: 'header_' + group.monthKey,
        monthKey: group.monthKey,
        monthLabel: group.monthLabel,
        count: group.events.length,
        isExpanded,
      });
      if (isExpanded) {
        for (const event of group.events) {
          result.push({ type: 'event', ...event });
        }
      }
    }
    return result;
  }, [groupedData, expandedMonths]);

  // Initialize on mount
  useEffect(() => {
    initializeScreen();
  }, []);

  // Handle deep link navigation after data is loaded
  useEffect(() => {
    if (isDeepLink && deepLinkObjId && groupedData.length > 0) {
      const deepLinkItem = dataMapRef.current.get(deepLinkObjId);
      if (deepLinkItem) {
        // Auto-expand the month containing the deep-linked event
        if (deepLinkItem.monthKey) {
          setExpandedMonths(prev => {
            const next = new Set(prev);
            next.add(deepLinkItem.monthKey);
            return next;
          });
        }
        navigation.navigate("EventoDetail", { eventoObj: deepLinkItem });
      }
    }
  }, [isDeepLink, deepLinkObjId, groupedData, navigation]);

  const initializeScreen = async () => {
    try {
      // Get all initial data in parallel
      const [userGruposArr, deepObjId, user] = await Promise.all([
        getUserGruposAsyncStorage(),
        getDeepObjIdAsyncStorage(),
        Parse.User.currentAsync()
      ]);

      if (userGruposArr) {
        userGruposIdsRef.current = userGruposArr;
      }

      if (deepObjId) {
        console.log("We have a DeepLink");
        setIsDeepLink(true);
        setDeepLinkObjId(deepObjId);
        destroyDeepLinkFromAsyncStorage();
      }

      if (user) {
        currentUserRef.current = user;
        const escuela = user.get('escuela');
        currEscuelaRef.current = escuela;

        // Get RSVP and Grupos in parallel, then fetch eventos
        const [rsvpArr, gruposDict] = await Promise.all([
          getEventosRSVP(user),
          getGrupos(escuela)
        ]);

        rsvpArrRef.current = rsvpArr;
        gruposObjRef.current = gruposDict;

        await retreiveEventosDisponibles();
      }
    } catch (error) {
      console.log("Error initializing screen:", error);
      setIsLoading(false);
    }
  };

  const getUserGruposAsyncStorage = async () => {
    try {
      const userGruposStr = await AsyncStorage.getItem('userGrupos');
      return userGruposStr || "";
    } catch (error) {
      console.log("ERROR_AS retrieving userGruposArr:", error);
      return "";
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

  const getEventosRSVP = async (currUser) => {
    try {
      const EventoRSVP = Parse.Object.extend("EventoRSVP");
      const query = new Parse.Query(EventoRSVP);
      query.equalTo("user", currUser);
      query.include('evento');
      const rsvpResults = await query.find();
      return rsvpResults
        .filter(item => item.get('evento') != null)
        .map(item => item.get('evento').id);
    } catch (error) {
      console.log("Error getting RSVP:", error);
      return [];
    }
  };

  const getGrupos = async (escuelaObj) => {
    try {
      const Grupo = Parse.Object.extend("grupo");
      const query = new Parse.Query(Grupo);
      query.equalTo("escuela", escuelaObj);
      const results = await query.find();

      const gruposDict = {};
      for (let i = 0; i < results.length; i++) {
        const object = results[i];
        gruposDict[object.id] = object.get('grupoId');
      }
      return gruposDict;
    } catch (error) {
      console.log("Error getting grupos:", error);
      presentFeedback("Mensajes vacio", "Hubo un problema al intentar buscar tus mensajes. Intenta de nuevo, por favor.");
      return {};
    }
  };

  const reloadTable = useCallback(async () => {
    rsvpArrRef.current = [];
    const user = await Parse.User.currentAsync();
    if (user) {
      currentUserRef.current = user;
      const rsvpArr = await getEventosRSVP(user);
      rsvpArrRef.current = rsvpArr;
      await retreiveEventosDisponibles();
    }
  }, []);

  const retreiveEventosDisponibles = async () => {
    setGroupedData([]);
    setIsLoading(true);

    try {
      const todayMinusOneMonth = dayjs().subtract(1, 'months').toDate();
      const Evento = Parse.Object.extend("evento");
      const query = new Parse.Query(Evento);
      query.equalTo("escuela", currEscuelaRef.current);
      query.greaterThanOrEqualTo("fecha", todayMinusOneMonth);

      const eventos = await query.find();
      const reversedEventos = [...eventos].reverse();
      await processEventoData(reversedEventos);
    } catch (error) {
      console.log("Error fetching eventos:", error);
      presentFeedback("Algo salio mal", "No fue posible traer la informacion de la actividad. Intenta de nuevo, por favor.");
      setIsLoading(false);
    }
  };

  const processEventoData = async (eventos) => {
    if (eventos.length === 0) {
      setIsLoading(false);
      setHasData(false);
      return;
    }

    const userGruposStr = userGruposIdsRef.current;
    const userGruposArr = userGruposStr ? userGruposStr.split(",") : [];
    // First, filter eventos visible to user and collect evento IDs
    const visibleEventos = [];
    for (let i = 0; i < eventos.length; i++) {
      const object = eventos[i];
      const publicoArr = object.get('publico');
      let isEventoVisibleForUser = true;

      if (publicoArr != null && publicoArr.length > 0 && !publicoArr.includes("all")) {
        isEventoVisibleForUser = publicoArr.some(item => userGruposArr.includes(item));
      }

      if (isEventoVisibleForUser) {
        visibleEventos.push(object);
      }
    }

    if (visibleEventos.length === 0) {
      setIsLoading(false);
      setHasData(false);
      return;
    }

    // Batch query for all EventoGaleria counts at once (avoiding N+1 queries)
    const eventoPhotoCountMap = new Map();
    if (visibleEventos.length > 0) {
      const EventoGaleria = Parse.Object.extend("EventoGaleria");
      const galeriaQuery = new Parse.Query(EventoGaleria);
      galeriaQuery.containedIn("evento", visibleEventos);
      galeriaQuery.select("evento"); // Only fetch the evento pointer
      galeriaQuery.limit(10000);

      try {
        const galeriaResults = await galeriaQuery.find();
        // Count photos per evento
        galeriaResults.forEach(galeria => {
          const eventoId = galeria.get('evento').id;
          eventoPhotoCountMap.set(eventoId, (eventoPhotoCountMap.get(eventoId) || 0) + 1);
        });
      } catch (error) {
        console.log("Error fetching galeria counts:", error);
      }
    }

    // Group events by month
    const monthGroupsMap = new Map(); // preserves insertion order
    const newDataMap = new Map();

    for (let i = 0; i < visibleEventos.length; i++) {
      const object = visibleEventos[i];
      const rawFecha = object.get('fecha');
      const isPastEvent = isDateInThePast(rawFecha);

      // Month grouping key (YYYY-MM for sort order) and label
      const fechaMoment = dayjs(rawFecha);
      const monthKey = fechaMoment.format('YYYY-MM');
      const monthLabel = fechaMoment.format('MMMM YYYY');

      // Publico
      const publicoArr = object.get('publico');
      let publicoDisplay = "Toda la escuela";
      if (publicoArr != null && publicoArr.length > 0 && !publicoArr.includes("all")) {
        const publicoIdsArr = publicoArr.map(item => gruposObjRef.current[item]);
        publicoDisplay = publicoIdsArr.join(", ");
      }

      // Check if has photos from our batch query
      const eventoHasPhoto = eventoPhotoCountMap.has(object.id);

      const nombreString = object.get('nombre');
      const fechaString = fechaMoment.format('D MMMM');
      const isRSVPRequired = object.get('confirmacion');
      let eventoRSVP = "Por confirmar";
      if (rsvpArrRef.current.includes(object.id)) {
        eventoRSVP = "Confirmada";
      }

      const itemData = {
        id: object.id,
        nombre: nombreString,
        fecha: fechaString,
        object: object,
        hasPhotos: eventoHasPhoto,
        publico: publicoDisplay,
        isRSVPRequired: isRSVPRequired,
        rsvp: eventoRSVP,
        isPastEvent: isPastEvent,
        reloadNow: reloadTable,
        monthKey: monthKey,
      };

      // Add to month group
      if (!monthGroupsMap.has(monthKey)) {
        monthGroupsMap.set(monthKey, {
          monthKey,
          monthLabel,
          events: [],
        });
      }
      monthGroupsMap.get(monthKey).events.push(itemData);
      newDataMap.set(object.id, itemData);
    }

    dataMapRef.current = newDataMap;

    const groups = Array.from(monthGroupsMap.values());
    setGroupedData(groups);
    setIsLoading(false);
  };

  const isDateInThePast = (date) => {
    const inputDate = dayjs(date);
    const today = dayjs().startOf('day');
    return inputDate.isBefore(today);
  };

  // Toggle month expansion
  const toggleMonth = useCallback((monthKey) => {
    setExpandedMonths(prev => {
      const next = new Set(prev);
      if (next.has(monthKey)) {
        next.delete(monthKey);
      } else {
        next.add(monthKey);
      }
      return next;
    });
  }, []);

  // Stable callback for item press - hoisted to root
  const handleItemPress = useCallback((itemId) => {
    const item = dataMapRef.current.get(itemId);
    if (item) {
      trackEvent("evento_open", {
        escuela: currEscuelaRef.current ? currEscuelaRef.current.id : "",
        eventoId: item.object ? item.object.id : ""
      });
      navigation.navigate("EventoDetail", { eventoObj: item });
    }
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
    if (item.type === 'month_header') {
      return (
        <MonthHeader
          monthKey={item.monthKey}
          monthLabel={item.monthLabel}
          count={item.count}
          isExpanded={item.isExpanded}
          onToggle={toggleMonth}
        />
      );
    }
    return (
      <EventCard
        id={item.id}
        nombre={item.nombre}
        fecha={item.fecha}
        hasPhotos={item.hasPhotos}
        publico={item.publico}
        isRSVPRequired={item.isRSVPRequired}
        rsvp={item.rsvp}
        onPress={handleItemPress}
      />
    );
  }, [handleItemPress, toggleMonth]);

  const keyExtractor = useCallback((item) => item.id, []);

  const getItemType = useCallback((item) => item.type, []);

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Text style={styles.titleText}>Eventos</Text>
      </View>

      <View style={styles.container}>
        {isLoading && (
          <ActivityIndicator
            size="large"
            color="white"
            animating={isLoading}
            style={styles.loader}
          />
        )}

        {!isLoading && hasData ? (
          <FlashList
            data={flatListData}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            getItemType={getItemType}
            estimatedItemSize={120}
            contentContainerStyle={styles.flatlistContent}
            showsVerticalScrollIndicator={false}
          />
        ) : !isLoading && (
          <View style={styles.emptyStateView}>
            <Text style={styles.emptyStateText}>
              Aqui van a aparecer eventos de tu Escuela. Por ahora no hay eventos.
            </Text>
            <ExpoImage
              source={require('../assets/images/Chuchi.png')}
              style={styles.emptyStateLogoImg}
              contentFit="contain"
            />
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.grassDark,
  },
  header: {
    paddingHorizontal: 16,
    paddingVertical: 16,
    backgroundColor: Colors.grassDark,
  },
  titleText: {
    color: 'white',
    fontSize: 28,
    fontWeight: 'bold',
  },
  container: {
    flex: 1,
    backgroundColor: Colors.grassDark,
  },
  loader: {
    marginTop: 40,
  },
  flatlistContent: {
    paddingHorizontal: 16,
    paddingBottom: 24,
  },

  // Month Header Styles
  monthHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.15)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
    marginTop: 4,
  },
  monthHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  monthHeaderText: {
    color: 'white',
    fontSize: 18,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  monthCountBadge: {
    backgroundColor: 'rgba(255,255,255,0.25)',
    borderRadius: 10,
    minWidth: 24,
    height: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginLeft: 10,
    paddingHorizontal: 8,
  },
  monthCountText: {
    color: 'white',
    fontSize: 13,
    fontWeight: '700',
  },
  monthChevron: {
    color: 'white',
    fontSize: 18,
  },

  // Card Styles
  cardContainer: {
    marginBottom: 12,
  },
  card: {
    backgroundColor: 'white',
    borderRadius: 16,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 8,
    elevation: 4,
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  dateContainer: {
    backgroundColor: Colors.bluejeansLight,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 8,
  },
  dateText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  photoBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.grassDark,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 8,
  },
  photoIcon: {
    height: 14,
    width: 14,
    marginRight: 6,
  },
  photoText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  eventName: {
    color: Colors.darkGrayDark,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 16,
    lineHeight: 26,
  },
  detailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
  },
  publicoContainer: {
    flex: 1,
    marginRight: 12,
  },
  labelText: {
    color: Colors.darkGrayLight,
    fontSize: 11,
    fontWeight: '600',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: 4,
  },
  publicoText: {
    color: Colors.darkGrayDark,
    fontSize: 14,
    fontWeight: '500',
  },

  // RSVP Badge Styles
  rsvpBadge: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 12,
  },
  rsvpBadgeConfirmed: {
    backgroundColor: Colors.mintLight + '30',
  },
  rsvpBadgePending: {
    backgroundColor: Colors.sunflowerLight + '40',
  },
  rsvpText: {
    fontSize: 12,
    fontWeight: '700',
  },
  rsvpTextConfirmed: {
    color: Colors.mintDark,
  },
  rsvpTextPending: {
    color: Colors.sunflowerDark,
  },

  // Empty State
  emptyStateView: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyStateText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
    textAlign: 'center',
    lineHeight: 24,
  },
  emptyStateLogoImg: {
    height: 80,
    width: 80,
    marginTop: 40,
  },
});
