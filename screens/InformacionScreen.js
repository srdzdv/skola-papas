import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import { trackEvent } from "@aptabase/react-native";
var Parse = require('parse/react-native');
import dayjs from '../utils/dayjs';
import Colors from '../constants/Colors';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  View,
  Platform,
  StyleSheet,
  Text,
  Pressable,
  SafeAreaView,
  ActivityIndicator,
  Alert,
  Dimensions,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Ionicons } from '@expo/vector-icons';

const { width } = Dimensions.get('window');
const ITEM_MARGIN = 20;
const ITEM_WIDTH = (width - (3 * ITEM_MARGIN)) / 2;

// Memoized list item component - pass primitives for effective memoization
const InfoItem = memo(function InfoItem({
  id,
  tipo,
  contenido,
  timestamp,
  onPress,
}) {
  const handlePress = useCallback(() => {
    onPress(id);
  }, [id, onPress]);

  const formattedDate = dayjs(timestamp, "DD/MMM").format("DD MMM, YYYY");

  return (
    <Pressable style={styles.gridItem} onPress={handlePress}>
      <View style={styles.listCard}>
        <View style={styles.cardHeader}>
          <Text style={styles.tipoText}>{tipo}</Text>
          <Text style={styles.timestampText}>{formattedDate}</Text>
        </View>
        {contenido && (
          <Text style={styles.contenidoText} numberOfLines={2}>
            {contenido}
          </Text>
        )}
        <View style={styles.cardFooter}>
          <Text style={styles.pdfIndicator}>PDF</Text>
          <Ionicons name="chevron-forward" size={20} color={Colors.darkGrayLight} />
        </View>
      </View>
    </Pressable>
  );
});

export default function InformacionScreen({ navigation }) {
  // State
  const [data, setData] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isDeepLink, setIsDeepLink] = useState(false);
  const [deepLinkObjId, setDeepLinkObjId] = useState("");
  const [isRefreshing, setIsRefreshing] = useState(false);

  // Refs
  const currentUserRef = useRef(new Parse.User());
  const escuelaNombreRef = useRef("");
  const dataMapRef = useRef(new Map()); // Store full item data for navigation

  // Navigation options
  InformacionScreen.navigationOptions = {
    header: null,
  };

  // Initialize on mount
  useEffect(() => {
    initializeScreen();
  }, []);

  // Handle deep link navigation after data is loaded
  useEffect(() => {
    if (isDeepLink && deepLinkObjId && data.length > 0) {
      const deepLinkItem = dataMapRef.current.get(deepLinkObjId);
      if (deepLinkItem) {
        navigation.navigate("InfoDet", { item: deepLinkItem });
      }
    }
  }, [isDeepLink, deepLinkObjId, data, navigation]);

  const initializeScreen = async () => {
    try {
      // Get deep link and user data in parallel
      const [deepObjId, user] = await Promise.all([
        getDeepObjIdAsyncStorage(),
        Parse.User.currentAsync()
      ]);

      if (deepObjId) {
        console.log("We have a DeepLink");
        setIsDeepLink(true);
        setDeepLinkObjId(deepObjId);
        destroyDeepLinkFromAsyncStorage();
      }

      if (user) {
        currentUserRef.current = user;
        const escuela = user.get('escuela');
        await getUserEscuela(escuela.id);
      }
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

  const getUserEscuela = async (escuelaObjId) => {
    console.log("Getting school");
    try {
      const Escuela = Parse.Object.extend("Escuela");
      const query = new Parse.Query(Escuela);
      const escuelaFetched = await query.get(escuelaObjId);

      escuelaNombreRef.current = escuelaFetched.get('nombre');
      await getInformacion(escuelaFetched);
    } catch (error) {
      console.log("Error getting escuela:", error);
      presentFeedback("Informacion vacia", "Hubo un problema, Intenta de nuevo, por favor.");
      setIsLoading(false);
    }
  };

  const getInformacion = async (escuelaObj) => {
    console.log("Getting info");
    try {
      const Informacion = Parse.Object.extend('Informacion');
      const queryInfo = new Parse.Query(Informacion);
      queryInfo.equalTo("escuela", escuelaObj);
      queryInfo.descending("updatedAt");

      const results = await queryInfo.find();

      const informArr = [];
      const newDataMap = new Map();

      for (let i = 0; i < results.length; i++) {
        const object = results[i];
        const tipo = object.get('tipo');
        const contenido = object.get('contenido');
        const pdf = object.get('pdf');
        const aws = object.get('aws');
        const newS3Bucket = object.get('newS3Bucket');
        const timestampString = dayjs(object.updatedAt).format("DD/MMM");

        const itemData = {
          id: object.id,
          tipo: tipo,
          contenido: contenido,
          pdf: pdf,
          aws: aws,
          newS3Bucket: newS3Bucket,
          timestamp: timestampString
        };

        informArr.push(itemData);
        newDataMap.set(object.id, itemData);
      }

      dataMapRef.current = newDataMap;
      setData(informArr);
      setIsLoading(false);
    } catch (error) {
      console.log("getInformacion ERROR: " + JSON.stringify(error));
      presentFeedback("Informacion vacia", "Ocurrio un problema, intenta de nuevo");
      setIsLoading(false);
    }
  };

  const presentFeedback = (alertTitle, alertMessage) => {
    Alert.alert(
      alertTitle,
      alertMessage,
      [{ text: 'Ok', onPress: null, style: 'default' }],
      { cancelable: false },
    );
  };

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const user = await Parse.User.currentAsync();
      if (user) {
        currentUserRef.current = user;
        const escuela = user.get('escuela');
        await getUserEscuela(escuela.id);
      }
    } catch (error) {
      console.log("Error refreshing:", error);
    }
    setIsRefreshing(false);
  }, []);

  // Stable callback for item press - hoisted to root
  const handleItemPress = useCallback((itemId) => {
    const item = dataMapRef.current.get(itemId);
    if (item) {
      navigation.navigate("InfoDet", { item: item });
    }
  }, [navigation]);

  // Memoized renderItem function
  const renderItem = useCallback(({ item }) => {
    return (
      <InfoItem
        id={item.id}
        tipo={item.tipo}
        contenido={item.contenido}
        timestamp={item.timestamp}
        onPress={handleItemPress}
      />
    );
  }, [handleItemPress]);

  // Stable keyExtractor using unique ID instead of index
  const keyExtractor = useCallback((item) => item.id, []);

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.container}>
        <View style={styles.header}>
          {isLoading ? (
            <ActivityIndicator
              size="small"
              color="#FFFFFF"
              animating={isLoading}
              style={styles.headerLoading}
              hidesWhenStopped={true}
            />
          ) : (
            <Text style={styles.headerTitle}>Informacion</Text>
          )}
        </View>
        <View style={styles.dividerView} />
        <View style={styles.contentContainer}>
          <FlashList
            data={data}
            renderItem={renderItem}
            keyExtractor={keyExtractor}
            numColumns={2}
            estimatedItemSize={196}
            refreshing={isRefreshing}
            onRefresh={onRefresh}
            contentContainerStyle={styles.listContainer}
          />
        </View>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: Colors.sunflowerDark,
  },
  safeArea: {
    flex: 1,
    backgroundColor: Colors.sunflowerDark
  },
  contentContainer: {
    flex: 1,
  },
  header: {
    backgroundColor: Colors.sunflowerDark,
    height: Platform.OS === 'ios' ? 38 : 56,
    flexDirection: 'row',
    justifyContent: 'center',
  },
  headerLoading: {
    marginTop: 16
  },
  dividerView: {
    height: 2,
    backgroundColor: Colors.sunflowerLight,
  },
  headerTitle: {
    marginTop: Platform.OS === 'ios' ? 6 : 28,
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold'
  },
  listContainer: {
    padding: 8,
  },
  gridItem: {
    width: ITEM_WIDTH,
    margin: 8,
    marginBottom: 16,
  },
  listCard: {
    backgroundColor: "#fff",
    borderRadius: 8,
    padding: 12,
    height: 180,
    justifyContent: 'space-between',
  },
  cardHeader: {
    marginBottom: 8,
  },
  tipoText: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  timestampText: {
    fontSize: 10,
    color: Colors.darkGrayLight,
    marginBottom: 4,
  },
  contenidoText: {
    fontSize: 12,
    color: Colors.darkGrayDark,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  pdfIndicator: {
    fontSize: 10,
    fontWeight: 'bold',
    color: Colors.darkGrayDark,
    backgroundColor: Colors.sunflowerLight,
    paddingHorizontal: 4,
    paddingVertical: 2,
    borderRadius: 4,
  },
});
