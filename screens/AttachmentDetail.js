import React from 'react';
import { trackEvent } from "@aptabase/react-native";
import { Video, ResizeMode } from 'expo-av';
import dayjs from '../utils/dayjs';
import Colors from '../constants/Colors';
import { View,
  StyleSheet,
  Text,
  Pressable,
  SafeAreaView,
  Platform,
  ActivityIndicator,
  Dimensions,
  Alert
} from 'react-native';
import { Image } from 'expo-image';
import { WebView } from 'react-native-webview';
import * as MediaLibrary from 'expo-media-library';
import Constants from '../constants/Constants';
import { getSignedObjectUrl, getOLDS3SignedUrl } from '../s3API';


const screenWidth = Dimensions.get('window').width;
const screenHeight = Dimensions.get('window').height;
const screenPaddingTop = Platform.OS === 'ios' ? 4 : 28;
const videoPlayerScreenHeight = screenHeight - screenPaddingTop;

import * as FileSystem from 'expo-file-system/legacy';
import * as Share from 'expo-sharing';

  export default class AttachmentDetail extends React.Component {
  
    constructor(props) {
        super(props);   
        const item = props.route.params;
        var urlString = "";
        var fileType = "";
        var showWebView = false;
        var showVideoComponentBOOL = false;
        var showLoadingIndicator = false;

        if (item.fullSizeUrl) {
          urlString = item.fullSizeUrl;
        }

        if (item.tipo == "PDF") {
          fileType = "PDF";
          showWebView = true;
          showLoadingIndicator = false;
          if (Platform.OS === "android") {
            urlString = "https://docs.google.com/gview?embedded=true&url=" + encodeURIComponent(urlString);
          }
        } else if (item.tipo == "VID") {
          console.log("item.tipo VID");
          showLoadingIndicator = true;
          fileType = "VID";
          showVideoComponentBOOL = true;
        } else {
          fileType = "JPG";
          showLoadingIndicator = true;
        }

        this.state = {
          navParams: item,
          isLoading: showLoadingIndicator,
          showWebView: showWebView,
          assetURL: urlString,
          showVideoComponent: showVideoComponentBOOL,
          fileType: fileType,
          localURI: "",
          objectId: item.objectId,
          newS3Bucket: item.newS3Bucket || false
        };
    }

    static navigationOptions = {
        header: null,
    };

    // Replace deprecated UNSAFE_componentWillMount with componentDidMount
    async componentDidMount() {
        let item = this.state.navParams;
        if (item.url) {
          // Handle existing image/video URL logic
          var itemURL = item.url;
          if (itemURL.includes("resized-")) {
            itemURL = itemURL.replace("resized-", "")
          }
          this.setState({isLoading: false, assetURL: itemURL});
        }
    }

    shareAttachmentBtnPressed() {
      // File Extention 
      var fileExtentionString = "";
      switch (this.state.fileType) {
        case "PDF":
          fileExtentionString = ".pdf";
          break;
        case "VID":
          fileExtentionString = ".mov";
          break;
        case "JPG":
          fileExtentionString = ".png";
          break;
        default:
          break;
      }
      // Expo File System
      const fileDirectory = FileSystem.documentDirectory + "adjunto_skola"+fileExtentionString;
      FileSystem.downloadAsync(this.state.assetURL, fileDirectory)
      .then(({ uri, status }) => {
        // Save uri to state
        this.setState({localURI: uri});
        // Present options
        this.displayShareOrSaveToLibrary();
      });
    }

    // Guardar a carrete o compartir?
    displayShareOrSaveToLibrary() {
      this.presentFeedback("Selecciona una opción", "Comparte o guarda la foto", false); 
    }

    savePhotoToLibrary() {
      const uri = this.state.localURI;
      MediaLibrary.saveToLibraryAsync(uri).then(() => {
        this.presentFeedback("Foto Guardada", "La foto ha sido guardada en tu carrete de fotos.", true);
      });
    }

    sharePhotoOption() {
      const uri = this.state.localURI;
      Share.shareAsync(uri);
    }

    backBtnPressed() {
        this.props.navigation.goBack();
    }

    presentFeedback(alertTitle, alertMessage, isFinal) {
      var options = [];
      if (isFinal) {
        const params = {text: 'Ok', onPress: null, style: 'default'};
        options.push(params);
      } else {
        if (Platform.OS === 'ios') {
          const saveParams = {text: 'Guarda foto al carrete', onPress: () => this.savePhotoToLibrary(), style: 'default'};
          options.push(saveParams);
        }
        const shareParams = {text: 'Comparte la foto', onPress: () => this.sharePhotoOption(), style: 'default'};
        options.push(shareParams);
        const cancel = {text: 'Cancelar', onPress: null, style: 'default'};
        options.push(cancel);
      }

      Alert.alert(
        alertTitle,
        alertMessage,
        options,
        {cancelable: false},
      );
    }

    handleVideoLoad() {
      this.setState({isLoading: false});
    }

    handleImageLoad() {
      this.setState({isLoading: false});
    }



    render() {
        return(
            <SafeAreaView style={styles.safeArea}>
              <View style={styles.topContainer}>
                <Pressable style={styles.topButton} onPress={() => this.backBtnPressed()}>
                  <Text style={styles.backBtnText}>{"< Atrás"}</Text>
                </Pressable>
                <Pressable style={styles.topButton} onPress={this.shareAttachmentBtnPressed.bind(this)}>
                  <Text style={styles.backBtnText}>Guardar</Text>
                </Pressable>
              </View>

              <View style={styles.dividerView}></View>

              {this.state.isLoading && (
                <View style={styles.loadingContainer}>
                  <ActivityIndicator size="large" color="#ffff" />
                </View>
              )}

              {this.state.assetURL.length > 0 && this.state.showWebView && (
                <View style={styles.webViewContainer}>
                  <WebView
                    source={{uri: this.state.assetURL}}
                    style={styles.webView}
                    javaScriptEnabled={true}
                    domStorageEnabled={true}
                    startInLoadingState={true}
                    scalesPageToFit={true}
                    onLoadStart={() => console.log("PDF loading started")}
                    onLoad={() => console.log("PDF loaded")}
                    onError={(error) => console.log("WebView error:", error)}
                  />
                </View>
              )}

              {this.state.assetURL.length > 0 && !this.state.showWebView && !this.state.showVideoComponent && (
                <View style={styles.container}>
                  <Image
                    source={{uri: this.state.assetURL}}
                    style={styles.imageStlye}
                    contentFit="contain"
                    onLoad={this.handleImageLoad.bind(this)}
                    transition={200}
                  />
                </View>
              )}

              {this.state.showVideoComponent && (
                <View>
                  <Video
                    source={{ uri: this.state.assetURL }}
                    style={styles.videoPlayer}
                    onLoad={this.handleVideoLoad.bind(this)}
                    useNativeControls
                    resizeMode={ResizeMode.CONTAIN}
                    isLooping
                    shouldPlay
                  />
                </View>
              )}
            </SafeAreaView>
        )
    }
  }


  const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: Colors.aquaDark
    },
    topContainer: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingTop: Platform.OS === 'ios' ? 4 : 28,
        paddingHorizontal: 12,
    },
    topButton: {
        padding: 4,
    },
    container: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    backBtnText: {
        color: Colors.actionColor,
        fontWeight: '700',
        fontSize: 17
    },
    imageStlye: {
      marginTop: -68,
      height: screenHeight - 250,
      width: screenWidth - 16,
      borderRadius: 10,
      borderCurve: 'continuous',
    },
    dividerView: {
        height: 2,
        backgroundColor: Colors.aquaLight,
        marginTop: 4
    },
    loadingContainer: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        justifyContent: 'center',
        alignItems: 'center',
        zIndex: 10,
    },
    webViewContainer: {
        flex: 1,
    },
    webView: {
        flex: 1,
    },
    videoPlayer: {
        width: screenWidth,
        height: videoPlayerScreenHeight,
    },
  });