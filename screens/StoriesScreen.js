import React, { useState, useEffect, useCallback, useRef, memo } from 'react';
import {
  SafeAreaView,
  StyleSheet,
  Text,
  View,
  Dimensions,
  ActivityIndicator,
  Pressable,
  RefreshControl,
} from 'react-native';
import { FlashList } from '@shopify/flash-list';
import { Image as ExpoImage } from 'expo-image';
import { Video, ResizeMode } from 'expo-av';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused } from '@react-navigation/native';
import Colors from '../constants/Colors';
import { getSignedObjectUrl } from '../s3API';
import dayjs from '../utils/dayjs';

const Parse = require('parse/react-native');

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const STORY_HEIGHT = SCREEN_HEIGHT - 180;

// Memoized Story Item Component
const StoryItem = memo(function StoryItem({
  id,
  autorName,
  mediaType,
  mediaUrl,
  textOverlay,
  textPositionY,
  textFontSize,
  textColor,
  timeAgo,
  isVisible,
  isMuted,
  onVideoRef,
  onTogglePause,
  onToggleMute,
}) {
  const videoRef = useRef(null);
  const [isPaused, setIsPaused] = useState(false);

  useEffect(() => {
    if (videoRef.current) {
      onVideoRef(id, videoRef.current);
    }
  }, [id, onVideoRef]);

  useEffect(() => {
    if (mediaType === 'video' && videoRef.current) {
      if (isVisible && !isPaused) {
        videoRef.current.playAsync();
      } else {
        videoRef.current.pauseAsync();
        if (!isVisible) {
          videoRef.current.setPositionAsync(0);
          setIsPaused(false);
        }
      }
    }
  }, [isVisible, mediaType, isPaused]);

  const handleTap = useCallback(() => {
    if (mediaType !== 'video') return;
    setIsPaused((prev) => !prev);
    if (onTogglePause) onTogglePause(id);
  }, [mediaType, id, onTogglePause]);

  return (
    <Pressable style={styles.storyContainer} onPress={handleTap}>
      {mediaType === 'video' && mediaUrl ? (
        <Video
          key={id}
          ref={videoRef}
          source={{ uri: mediaUrl }}
          style={styles.media}
          resizeMode={ResizeMode.COVER}
          shouldPlay={isVisible && !isPaused}
          isLooping
          isMuted={isMuted}
          posterSource={{ uri: mediaUrl }}
          usePoster
        />
      ) : mediaUrl ? (
        <ExpoImage
          source={{ uri: mediaUrl }}
          style={styles.media}
          contentFit="cover"
          transition={200}
          cachePolicy="memory-disk"
          recyclingKey={id}
        />
      ) : (
        <View style={styles.placeholder}>
          <ActivityIndicator size="large" color={Colors.bluejeansLight} />
        </View>
      )}

      {/* Pause overlay for videos */}
      {mediaType === 'video' && isPaused && isVisible && (
        <View style={styles.pauseOverlay}>
          <View style={styles.pauseIconCircle}>
            <Ionicons name="play" size={40} color="#FFF" />
          </View>
        </View>
      )}

      {/* Text overlay */}
      {textOverlay && textPositionY !== null ? (
        <View
          style={[
            styles.textOverlay,
            { top: `${textPositionY * 100}%` },
          ]}
        >
          <Text
            style={[
              styles.overlayText,
              {
                fontSize: textFontSize || 24,
                color: textColor || '#FFFFFF',
              },
            ]}
          >
            {textOverlay}
          </Text>
        </View>
      ) : null}

      {/* Author info + mute button */}
      <View style={styles.authorOverlay}>
        <View style={styles.authorRow}>
          <Ionicons name="person-circle-outline" size={28} color="#FFF" />
          <View style={styles.authorInfo}>
            <Text style={styles.authorName}>{autorName}</Text>
            <Text style={styles.timeAgo}>{timeAgo}</Text>
          </View>
        </View>
      </View>

      {/* Mute/unmute button for videos */}
      {mediaType === 'video' && isVisible && (
        <Pressable
          style={styles.muteButton}
          onPress={(e) => {
            e.stopPropagation?.();
            onToggleMute();
          }}
          hitSlop={12}
        >
          <Ionicons
            name={isMuted ? 'volume-mute' : 'volume-high'}
            size={20}
            color="#FFF"
          />
        </Pressable>
      )}
    </Pressable>
  );
});

export default function StoriesScreen({ navigation }) {
  const [stories, setStories] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [visibleIndex, setVisibleIndex] = useState(0);
  const [hasStories, setHasStories] = useState(true);
  const [isMuted, setIsMuted] = useState(false);

  const isFocused = useIsFocused();

  const currentUserRef = useRef(null);
  const currentEscuelaRef = useRef(null);
  const videoRefsMap = useRef(new Map());
  const viewedStoriesRef = useRef(new Set());

  useEffect(() => {
    initializeScreen();
  }, []);

  // Pause all videos when tab loses focus
  useEffect(() => {
    if (!isFocused) {
      videoRefsMap.current.forEach((ref) => {
        try {
          ref.pauseAsync();
        } catch (_) {}
      });
    } else {
      // Resume the visible video when tab regains focus
      const visibleStory = stories[visibleIndex];
      if (visibleStory?.mediaType === 'video') {
        const ref = videoRefsMap.current.get(visibleStory.id);
        if (ref) {
          try {
            ref.playAsync();
          } catch (_) {}
        }
      }
    }
  }, [isFocused, visibleIndex, stories]);

  const initializeScreen = async () => {
    try {
      const user = await Parse.User.currentAsync();
      if (!user) return;

      currentUserRef.current = user;
      const escuela = user.get('escuela');
      currentEscuelaRef.current = escuela;

      await fetchStories(escuela);
    } catch (error) {
      console.error('Error initializing StoriesScreen:', error);
      setIsLoading(false);
    }
  };

  const fetchStories = async (escuela) => {
    try {
      const Story = Parse.Object.extend('Story');
      const query = new Parse.Query(Story);
      query.equalTo('escuela', escuela);
      query.greaterThan('expiresAt', new Date());
      query.descending('createdAt');
      query.include('autor');
      query.limit(50);

      const results = await query.find();

      if (results.length === 0) {
        setHasStories(false);
        setIsLoading(false);
        setIsRefreshing(false);
        return;
      }

      const processedStories = await Promise.all(
        results.map(async (story) => {
          const autor = story.get('autor');
          const s3Key = story.get('s3ObjectKey');
          const textPosition = story.get('textPosition');

          let mediaUrl = null;

          try {
            if (s3Key) {
              mediaUrl = await getSignedObjectUrl(s3Key);
            }
          } catch (error) {
            console.error('Error getting signed URL for story:', story.id, error);
          }

          return {
            id: story.id,
            autorName: autor?.get('username') || 'Anónimo',
            autorId: autor?.id || '',
            mediaType: story.get('mediaType') || 'image',
            mediaUrl,
            textOverlay: story.get('textOverlay') || null,
            textPositionY: textPosition?.y ?? null,
            textFontSize: textPosition?.fontSize ?? 24,
            textColor: textPosition?.color ?? '#FFFFFF',
            timeAgo: dayjs(story.createdAt || new Date()).fromNow(),
            expiresAt: story.get('expiresAt'),
          };
        })
      );

      setStories(processedStories);
      setHasStories(processedStories.length > 0);
      setIsLoading(false);
      setIsRefreshing(false);
    } catch (error) {
      console.error('Error fetching stories:', error);
      setIsLoading(false);
      setIsRefreshing(false);
    }
  };

  const saveStoryView = useCallback(async (storyId) => {
    if (viewedStoriesRef.current.has(storyId)) {
      return;
    }

    viewedStoriesRef.current.add(storyId);

    try {
      const currentUser = await Parse.User.currentAsync();
      if (!currentUser) return;

      const Story = Parse.Object.extend('Story');
      const storyPointer = Story.createWithoutData(storyId);

      const StoryView = Parse.Object.extend('StoryView');
      const checkQuery = new Parse.Query(StoryView);
      checkQuery.equalTo('story', storyPointer);
      checkQuery.equalTo('userID', currentUser);
      const existingView = await checkQuery.first();

      if (existingView) {
        return;
      }

      const storyView = new StoryView();
      storyView.set('story', storyPointer);
      storyView.set('userID', currentUser);

      await storyView.save();
    } catch (error) {
      console.error('Error saving story view:', error);
      viewedStoriesRef.current.delete(storyId);
    }
  }, []);

  const onViewableItemsChanged = useCallback(({ viewableItems }) => {
    if (viewableItems.length > 0) {
      const newIndex = viewableItems[0].index;
      setVisibleIndex(newIndex);

      const visibleStory = viewableItems[0].item;
      if (visibleStory?.id) {
        saveStoryView(visibleStory.id);
      }
    }
  }, [saveStoryView]);

  const viewabilityConfig = useRef({
    itemVisiblePercentThreshold: 50,
  }).current;

  const handleVideoRef = useCallback((id, ref) => {
    videoRefsMap.current.set(id, ref);
  }, []);

  const handleToggleMute = useCallback(() => {
    setIsMuted((prev) => !prev);
  }, []);

  const onRefresh = useCallback(async () => {
    setIsRefreshing(true);
    viewedStoriesRef.current.clear();
    if (currentEscuelaRef.current) {
      await fetchStories(currentEscuelaRef.current);
    } else {
      setIsRefreshing(false);
    }
  }, []);

  const renderStoryItem = useCallback(({ item, index, extraData }) => {
    const isVisible = index === extraData.visibleIndex && extraData.isFocused;

    return (
      <StoryItem
        id={item.id}
        autorName={item.autorName}
        mediaType={item.mediaType}
        mediaUrl={item.mediaUrl}
        textOverlay={item.textOverlay}
        textPositionY={item.textPositionY}
        textFontSize={item.textFontSize}
        textColor={item.textColor}
        timeAgo={item.timeAgo}
        isVisible={isVisible}
        isMuted={isMuted}
        onVideoRef={handleVideoRef}
        onToggleMute={handleToggleMute}
      />
    );
  }, [handleVideoRef, isMuted, handleToggleMute]);

  const keyExtractor = useCallback((item) => item.id, []);

  const getItemLayout = useCallback((_, index) => ({
    length: STORY_HEIGHT,
    offset: STORY_HEIGHT * index,
    index,
  }), []);

  const extraData = { visibleIndex, isFocused };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={Colors.bluejeansLight} />
          <Text style={styles.loadingText}>Cargando historias...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (!hasStories) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.emptyContainer}>
          <Ionicons name="images-outline" size={64} color={Colors.mediumGrayDark} />
          <Text style={styles.emptyTitle}>Tu escuela todavía no publica historias</Text>
          <Text style={styles.emptySubtitle}>
            Aquí aparecerán las historias del día.
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>Historias del Día</Text>
        <Text style={styles.headerSubtitle}>
          {stories.length} {stories.length === 1 ? 'historia hoy' : 'historias hoy'}
        </Text>
      </View>
      <View style={styles.listContainer}>
        <FlashList
          data={stories}
          renderItem={renderStoryItem}
          keyExtractor={keyExtractor}
          extraData={extraData}
          estimatedItemSize={STORY_HEIGHT}
          pagingEnabled
          showsVerticalScrollIndicator={false}
          snapToInterval={STORY_HEIGHT}
          decelerationRate="fast"
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={viewabilityConfig}
          getItemLayout={getItemLayout}
          refreshControl={
            <RefreshControl
              refreshing={isRefreshing}
              onRefresh={onRefresh}
              tintColor={Colors.bluejeansLight}
            />
          }
        />
      </View>
      <View style={styles.progressContainer}>
        {stories.map((_, index) => (
          <View
            key={index}
            style={[
              styles.progressDot,
              index === visibleIndex && styles.progressDotActive,
            ]}
          />
        ))}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: Colors.lavanderDark,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 8,
    paddingBottom: 8,
    backgroundColor: Colors.lavanderDark,
  },
  headerTitle: {
    color: '#FFF',
    fontSize: 20,
    fontWeight: 'bold',
  },
  headerSubtitle: {
    color: Colors.neutral200,
    fontSize: 14,
  },
  listContainer: {
    flex: 1,
  },
  storyContainer: {
    width: SCREEN_WIDTH,
    height: STORY_HEIGHT,
    backgroundColor: Colors.lavanderDark,
  },
  media: {
    width: '100%',
    height: '100%',
  },
  placeholder: {
    width: '100%',
    height: '100%',
    backgroundColor: Colors.grassDark,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pauseOverlay: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.25)',
  },
  pauseIconCircle: {
    width: 72,
    height: 72,
    borderRadius: 36,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingLeft: 4,
  },
  textOverlay: {
    position: 'absolute',
    left: 0,
    right: 0,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
    minHeight: 80,
  },
  overlayText: {
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  authorOverlay: {
    position: 'absolute',
    bottom: 80,
    left: 16,
    right: 16,
  },
  authorRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  authorInfo: {
    marginLeft: 10,
  },
  authorName: {
    color: '#FFF',
    fontWeight: 'bold',
    fontSize: 16,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  timeAgo: {
    color: 'rgba(255, 255, 255, 0.85)',
    fontSize: 13,
    marginTop: 2,
    textShadowColor: 'rgba(0, 0, 0, 0.75)',
    textShadowOffset: { width: 1, height: 1 },
    textShadowRadius: 3,
  },
  muteButton: {
    position: 'absolute',
    bottom: 88,
    right: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.neutral200,
  },
  loadingText: {
    color: '#FFF',
    marginTop: 16,
    fontSize: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: Colors.neutral200,
    paddingHorizontal: 32,
  },
  emptyTitle: {
    color: Colors.lavanderDark,
    alignSelf: 'center',
    textAlign: 'center',
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 16,
  },
  emptySubtitle: {
    color: Colors.mediumGrayDark,
    fontSize: 16,
    textAlign: 'center',
    marginTop: 8,
  },
  progressContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    paddingVertical: 12,
    backgroundColor: Colors.pinkroseClear,
  },
  progressDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: Colors.mediumGrayDark,
    marginHorizontal: 3,
  },
  progressDotActive: {
    backgroundColor: Colors.lavanderDark,
    width: 8,
    height: 8,
    borderRadius: 4,
  },
});
