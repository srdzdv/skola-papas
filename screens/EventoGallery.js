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
  ActivityIndicator,
  View,
  Dimensions,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { FlashList } from '@shopify/flash-list';
import { Image as ExpoImage } from 'expo-image';
import Constants from '../constants/Constants';

const screenWidth = Dimensions.get('window').width;
const RESIZED_PREFIX = "resized-";
const IMAGES_PER_PAGE = 9;
const NUM_COLUMNS = 3;

import { getSignedObjectUrl } from '../s3API';

// Memoized gallery item component - pass primitives for effective memoization
const GalleryItem = memo(function GalleryItem({
  id,
  url,
  onPress,
}) {
  const handlePress = useCallback(() => {
    onPress(id);
  }, [id, onPress]);

  return (
    <Pressable onPress={handlePress} style={styles.galleryItemPressable}>
      <View style={styles.galleryItemContainer}>
        <ExpoImage
          source={{ uri: url }}
          style={styles.galleryImg}
          contentFit="cover"
          transition={200}
          cachePolicy="memory-disk"
          recyclingKey={`gallery-${id}`}
        />
      </View>
    </Pressable>
  );
});

export default function EventoGallery({ route, navigation }) {
  // Navigation params
  const navParams = route.params;
  const eventoNombreString = navParams.eventoNombre;
  const eventoFecha = navParams.eventoFecha;
  const eventoObj = navParams.eventoObj;

  // State
  const [isLoading, setIsLoading] = useState(true);
  const [data, setData] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);

  // Refs
  const currentUserRef = useRef(new Parse.User());

  // Navigation options
  EventoGallery.navigationOptions = {
    header: null,
  };

  // Initialize on mount
  useEffect(() => {
    retreiveGaleriaEvento();
  }, []);

  const retreiveGaleriaEvento = async () => {
    try {
      const EventoGaleria = Parse.Object.extend("EventoGaleria");
      const query = new Parse.Query(EventoGaleria);
      query.equalTo("evento", eventoObj);
      query.limit(150);
      const results = await query.find();
      console.log("Found " + results.length + " photos.");

      // Process all gallery items in parallel for faster loading
      const imagePromises = results.map(async (galeriaObj) => {
        const isNewBucket = galeriaObj.get('newS3Bucket');
        return getAttachmentFromS3(galeriaObj.id, isNewBucket);
      });

      // Wait for all images to be processed
      const imageResults = await Promise.allSettled(imagePromises);

      // Filter successful results and set data at once
      const validImages = imageResults
        .filter(result => result.status === 'fulfilled' && result.value !== null)
        .map(result => result.value);

      setData(validImages);
      setIsLoading(false);
    } catch (error) {
      console.log("Error retrieving gallery:", error);
      setIsLoading(false);
    }
  };

  const getAttachmentFromS3 = async (objectId, isNewBucket) => {
    try {
      let imageS3URL = Constants.AWS_BucketURL + objectId;
      let fullSizeURL = "";

      if (isNewBucket) {
        // Fetch both URLs in parallel
        const [resizedUrl, originalUrl] = await Promise.all([
          getSignedObjectUrl(RESIZED_PREFIX + objectId),
          getSignedObjectUrl(objectId)
        ]);
        imageS3URL = resizedUrl;
        fullSizeURL = originalUrl;
      }

      // Return the data object directly instead of updating state each time
      return {
        id: objectId,
        url: imageS3URL,
        fullSizeURL: fullSizeURL
      };
    } catch (error) {
      console.log("Bad URL:", error);
      return null;
    }
  };

  // Stable callback for item press - hoisted to root
  const handleItemPress = useCallback((itemId) => {
    const item = data.find(d => d.id === itemId);
    if (item) {
      if (item.fullSizeURL) {
        navigation.navigate("AttachmentDetail", { url: item.fullSizeURL });
      } else {
        navigation.navigate("AttachmentDetail", { url: item.url });
      }
    }
  }, [data, navigation]);

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

  // Pagination helpers
  const totalPages = Math.ceil(data.length / IMAGES_PER_PAGE);

  const getPaginatedData = useCallback(() => {
    const startIndex = (currentPage - 1) * IMAGES_PER_PAGE;
    const endIndex = startIndex + IMAGES_PER_PAGE;
    return data.slice(startIndex, endIndex);
  }, [data, currentPage]);

  const loadNextPage = useCallback(() => {
    if (currentPage < totalPages) {
      setCurrentPage(prev => prev + 1);
    }
  }, [currentPage, totalPages]);

  const loadPreviousPage = useCallback(() => {
    if (currentPage > 1) {
      setCurrentPage(prev => prev - 1);
    }
  }, [currentPage]);

  // Memoized renderItem function
  const renderItem = useCallback(({ item }) => {
    return (
      <GalleryItem
        id={item.id}
        url={item.url}
        onPress={handleItemPress}
      />
    );
  }, [handleItemPress]);

  // Stable keyExtractor using unique ID instead of index
  const keyExtractor = useCallback((item) => item.id, []);

  const paginatedData = getPaginatedData();
  const isFirstPage = currentPage === 1;
  const isLastPage = currentPage === totalPages;

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
      <View style={styles.header}>
        <Pressable
          onPress={backBtnPressed}
          style={styles.backButton}
          hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
        >
          <Text style={styles.backBtnText}>← Atrás</Text>
        </Pressable>
      </View>
      <View style={styles.container}>
        <View style={styles.contentContainer}>
          <View style={styles.titleContainer}>
            <Text style={styles.titleText}>{eventoNombreString}</Text>
            <Text style={styles.subtitleText}>{eventoFecha}</Text>
            <Text style={styles.photoCountText}>
              {`${data.length} fotos disponibles`}
            </Text>
          </View>
          {isLoading ? (
            <ActivityIndicator
              size="large"
              color="#ffff"
              animating={isLoading}
              style={styles.loadingIndicator}
              hidesWhenStopped={true}
            />
          ) : (
            <View style={styles.listWrapper}>
              <FlashList
                data={paginatedData}
                renderItem={renderItem}
                keyExtractor={keyExtractor}
                numColumns={NUM_COLUMNS}
                estimatedItemSize={130}
                contentContainerStyle={styles.flatlistContent}
              />
              <View style={styles.paginationContainer}>
                <Pressable
                  onPress={loadPreviousPage}
                  disabled={isFirstPage}
                >
                  <Text style={[
                    styles.paginationButton,
                    isFirstPage && styles.paginationButtonDisabled
                  ]}>
                    Anterior
                  </Text>
                </Pressable>
                <Text style={styles.pageIndicator}>
                  {`Pagina ${currentPage} de ${totalPages || 1}`}
                </Text>
                <Pressable
                  onPress={loadNextPage}
                  disabled={isLastPage || totalPages === 0}
                >
                  <Text style={[
                    styles.paginationButton,
                    (isLastPage || totalPages === 0) && styles.paginationButtonDisabled
                  ]}>
                    Siguiente
                  </Text>
                </Pressable>
              </View>
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
    backgroundColor: Colors.grassLight
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: Colors.grassLight,
  },
  backButton: {
    paddingVertical: 4,
  },
  backBtnText: {
    color: 'white',
    fontWeight: '600',
    fontSize: 16,
  },
  subtitleText: {
    color: 'white',
    fontSize: 17,
    fontWeight: '400',
    marginBottom: 8
  },
  container: {
    flex: 1,
    paddingTop: 8,
    backgroundColor: Colors.grassLight,
  },
  contentContainer: {
    flex: 1,
    backgroundColor: Colors.grassLight,
  },
  listWrapper: {
    flex: 1,
  },
  titleContainer: {
    alignItems: 'center',
    backgroundColor: Colors.grassDark,
    borderRadius: 8,
    paddingTop: 4,
    paddingHorizontal: 16,
  },
  titleText: {
    color: 'white',
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 2
  },
  flatlistContent: {
    backgroundColor: Colors.grassDark,
    paddingLeft: 20,
    borderRadius: 8,
    marginBottom: 16,
    marginTop: 16
  },
  loadingIndicator: {
    margin: 16
  },
  lilstItemFecha: {
    color: 'white',
    fontWeight: '500',
    fontSize: 17
  },
  lilstItemNombre: {
    color: 'white',
    fontWeight: '300',
    fontSize: 17
  },
  galleryItemPressable: {
    flex: 1,
  },
  galleryItemContainer: {
    padding: 11
  },
  galleryImg: {
    height: 110,
    width: 90,
    borderRadius: 3
  },
  photoCountText: {
    color: 'white',
    fontSize: 15,
    fontWeight: '400',
    marginBottom: 6
  },
  paginationContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: Colors.grassDark,
    borderRadius: 8,
  },
  paginationButton: {
    color: Colors.actionColor,
    fontSize: 16,
    fontWeight: '600'
  },
  paginationButtonDisabled: {
    opacity: 0.5
  },
  pageIndicator: {
    color: 'white',
    fontSize: 14
  }
});
