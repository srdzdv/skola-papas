import React from 'react';
import { trackEvent } from "@aptabase/react-native";
var Parse = require('parse/react-native');
import { getSignedObjectUrl, getOLDS3SignedUrl } from '../s3API';

import dayjs from '../utils/dayjs';
import Colors from '../constants/Colors';
import { View,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  Platform,
  Dimensions,
  ActivityIndicator,
  Image } from 'react-native';
import { WebView } from 'react-native-webview';
import Constants from '../constants/Constants';
import * as FileSystem from 'expo-file-system';
import * as Share from 'expo-sharing';

  export default class InformacionDetailScreen extends React.Component{
  
    constructor(props) {
        super(props);

        const item = props.route.params.item;
        const urlString = "";
        
        this.state = {
          dataUri: [],
          objectId: item.id,
          isLoading: true,
          signedURL: urlString,
          title: item.tipo,
          newS3Bucket: item.newS3Bucket
        };

        console.log("item", item.id)
      }



      static navigationOptions={
          header:null,
      };


      async componentDidMount() {
        // Get PDF signed URL
        this.getSignedURL();
        // Record activity action
        Parse.User.currentAsync().then(function(user) {
          this.recordActivityAction(this.state.objectId, user.id);
        }.bind(this));
      }

      // Get PDF signed URL
      async getSignedURL() {
        var pdfURL = "";
        if (this.state.newS3Bucket) {
          pdfURL = await getSignedObjectUrl(this.state.objectId);
        } else {
          pdfURL = await getOLDS3SignedUrl(this.state.objectId);
        }

        // For Android, use Google Docs Viewer to display PDFs in WebView
        if (Platform.OS === "android") {
          pdfURL = "https://docs.google.com/gview?embedded=true&url=" + encodeURIComponent(pdfURL);
        }
        console.log("pdfURL", pdfURL);
        this.setState({ signedURL: pdfURL });
      }

      recordActivityAction(objectId, userId) {
        const Actividad = Parse.Object.extend("InformacionSeenBy");
        const query = new Parse.Query(Actividad);
        query.equalTo("infoId", objectId);
        query.equalTo("userId", userId);
        
        query.first().then((existingActivity) => {
          if (existingActivity) {
            console.log('InformacionSeenBy already exists for this infoId and userId');
          } else {
            const actividad = new Actividad();
            actividad.set("infoId", objectId);
            actividad.set("userId", userId);
            actividad.set("tipo", "seen");
            return actividad.save();
          }
        }).then((actividad) => {
          if (actividad) {
            console.log('InformacionSeenBy created: ' + actividad.id);
          }
        }).catch((error) => {
          console.log('InformacionSeenBy Failed to create or query, error code: ' + error.message);
        });
      }

      backBtnPressed() {
        this.props.navigation.goBack();
      }

     shareAttachmentBtnPressed() {
        // Expo File System
        const fileDirectory = FileSystem.documentDirectory + "informacion_skola.pdf";
        FileSystem.downloadAsync(this.state.signedURL, fileDirectory)
        .then(({ uri, status }) => {
          Share.shareAsync(uri);
        });
     }



      render() {
        return (
          <SafeAreaView style={styles.safeArea}>
          <View style={{ flex: 1}}>
            <View style={styles.topRowView}>
              <TouchableOpacity onPress={this.backBtnPressed.bind(this)}>
                  <Text style={styles.backBtnText}>{"< Atrás"}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={this.shareAttachmentBtnPressed.bind(this)}>
                  <Text style={styles.backBtnText}>{"Guardar"}</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.dividerView}></View>
            <View style={{alignItems: 'center', margin: 4}}>
            <Text style={styles.titleText}>{this.state.title}</Text>
            </View>
            {
              this.state.signedURL.length > 0 ? (
                <View style={styles.pdfContainer}>
                    <WebView
                      source={{uri: this.state.signedURL}}
                      style={styles.pdf}
                      onLoadStart={() => console.log("PDF loading started")}
                      onLoad={() => console.log("PDF loaded")}
                      onError={(error) => console.log("WebView error:", error)}
                      javaScriptEnabled={true}
                      domStorageEnabled={true}
                      startInLoadingState={true}
                      scalesPageToFit={true}
                      renderLoading={() => (
                        <View style={styles.loaderContainer}>
                          <View style={styles.loaderCard}>
                            <View style={styles.documentIconContainer}>
                              <View style={styles.documentIcon}>
                                <View style={styles.documentCorner}></View>
                                <View style={styles.documentLine}></View>
                                <View style={[styles.documentLine, { width: '60%' }]}></View>
                                <View style={[styles.documentLine, { width: '70%' }]}></View>
                              </View>
                            </View>
                            <ActivityIndicator size="large" color={Colors.sunflowerDark} />
                            <Text style={styles.loaderText}>Preparando documento...</Text>
                          </View>
                        </View>
                      )}
                    />
                </View>
              ) : (
                <View style={styles.loaderContainer}>
                  <View style={styles.loaderCard}>
                    <View style={styles.documentIconContainer}>
                      <View style={styles.documentIcon}>
                        <View style={styles.documentCorner}></View>
                        <View style={styles.documentLine}></View>
                        <View style={[styles.documentLine, { width: '60%' }]}></View>
                        <View style={[styles.documentLine, { width: '70%' }]}></View>
                      </View>
                    </View>
                    <ActivityIndicator 
                      size="large" 
                      color={Colors.sunflowerDark} 
                    />
                    <Text style={styles.loaderText}>Cargando documento...</Text>
                  </View>
                </View>
              )
            }
          </View>
          </SafeAreaView>
        )
      }

  }
  const styles = StyleSheet.create({
    safeArea: {
      flex: 1, 
      backgroundColor: Colors.sunflowerDark
    },
    ActivityIndicatorStyle: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
    loaderContainer: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
      backgroundColor: 'rgba(0,0,0,0.03)',
    },
    loaderCard: {
      backgroundColor: 'white',
      borderRadius: 12,
      padding: 24,
      alignItems: 'center',
      shadowColor: '#000',
      shadowOffset: { width: 0, height: 4 },
      shadowOpacity: 0.15,
      shadowRadius: 6,
      elevation: 5,
      minWidth: Dimensions.get('window').width * 0.7,
    },
    documentIconContainer: {
      marginBottom: 20,
      alignItems: 'center',
      justifyContent: 'center',
    },
    documentIcon: {
      width: 48,
      height: 60,
      backgroundColor: Colors.sunflowerDark,
      borderRadius: 4,
      position: 'relative',
      alignItems: 'flex-end',
      justifyContent: 'center',
      paddingHorizontal: 8,
    },
    documentCorner: {
      width: 15,
      height: 15,
      backgroundColor: 'white',
      position: 'absolute',
      top: 0,
      right: 0,
      borderBottomLeftRadius: 8,
    },
    documentLine: {
      height: 3,
      width: '80%',
      backgroundColor: 'rgba(255,255,255,0.5)',
      marginVertical: 4,
      borderRadius: 1.5,
      alignSelf: 'center',
    },
    loaderText: {
      marginTop: 16,
      fontSize: 16,
      fontWeight: '600',
      color: Colors.sunflowerDark,
      textAlign: 'center',
    },
    titleText: {
      color: 'white',
      fontSize: 15,
      fontWeight: '500'
    },
    topRowView: {
      paddingLeft: 8,
      paddingRight: 8,
      paddingTop: Platform.OS === 'ios' ? 6 : 28,
      paddingBottom: 2,
      flexDirection: 'row', 
      justifyContent: 'space-between',
      backgroundColor: Colors.sunflowerDark
    },
    subheaderTitle: {
      color: 'white',
      fontSize: 18,
      fontWeight: 'bold',
      textAlign: 'center',
      margin: 16
    },
    backBtnText: {
      color: Colors.actionColor,
      fontWeight: '700'
    },
    pdfContainer: {
      flex: 1,
      backgroundColor: '#ecf0f1',
    },
    pdf: {
      flex: 1,
      width: Dimensions.get('window').width,
      height: Dimensions.get('window').height,
    },
    dividerView: {
      height: 2,
      backgroundColor: Colors.sunflowerLight,
    },
  });