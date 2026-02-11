import React from 'react';
import { trackEvent } from "@aptabase/react-native";
import { uploadImageDataToAWS, getSignedObjectUrl, getOLDS3SignedUrl } from '../s3API';
import { callCloudFunction } from '../services/ApiResponseHandler';
import ImageAttachment from '../components/ImageAttachment.js'
var Parse = require('parse/react-native');
import Colors from '../constants/Colors';
import dayjs from '../utils/dayjs';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {
  Image,
  SafeAreaView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Dimensions,
  ActivityIndicator,
  Alert,
  DeviceEventEmitter
} from 'react-native';
import * as WebBrowser from 'expo-web-browser';
import * as ImagePicker from 'expo-image-picker';
import { Camera, CameraView, useCameraPermissions } from 'expo-camera';
const screenWidth = Dimensions.get('window').width;
import Constants from '../constants/Constants';
const albumBucketName = Constants.AWS_BucketName;
const accessKeyId = Constants.AWS_AccessKeyId
const secretAccessKey = Constants.AWS_SecAccessK
const region = Constants.AWS_Region



export default class PagoDetail extends React.Component {
    currentUser = new Parse.User();
    currentEscuela = new Parse.Object()

    static navigationOptions = {
        header: null,
      };

    constructor(props) {
        super(props);
        // CurrentEstudiante
        const navParams = props.route.params;
        const pagoObj = navParams.pagoObj;
        const isStripeActiveParam = navParams.isStripeActive;
        const stripeCommissionPercent = navParams.stripeCommissionPercent;
        const stripeConnectAccntId = navParams.stripeConnectAccntId;
        // Initial State
        this.state = { data: [],
                       isLoading: false,
                       pagoConcepto: pagoObj.concepto,
                       pagoFecha: pagoObj.timestamp,
                       pagoEstudiante: pagoObj.estudiante,
                       pagoCantidad: pagoObj.cantidad,
                       pagoStatus: pagoObj.status,
                       hasAttachment: pagoObj.hasAttachment,
                       isNewBucket: pagoObj.isNewBucket,
                       hasRecibo: pagoObj.hasRecibo,
                       folioRecibo: pagoObj.folioRecibo,
                       pagoObjId: pagoObj.id,
                       showCamera: false,
                       hasCameraPermission: null,
                       imgTakenBase64: null,
                       imageURL: "",
                       actionBtnText: "Capturar Comprobante de Pago",
                       isStripeActive: isStripeActiveParam,
                       stripeCommissionPercent: stripeCommissionPercent,
                       paidWithStripe: pagoObj.paidWithStripe,
                       stripeChargeAmount: pagoObj.stripeChargeAmount,
                       stripeConnectAccntId: stripeConnectAccntId,
                       facing: 'back',
                       thumbnailURL: ""
                       };
        this.cameraRef = React.createRef();
        if (pagoObj.isNewBucket) {
            this.fetchThumbnailForAttachment(pagoObj.id);
        }
    }

    UNSAFE_UNSAFE_componentWillMount() {
        this._requestCameraPermission();
    }

    componentDidMount() {
        this._requestCameraPermission();
    }

    backBtnPressed() {
        this.props.navigation.goBack();
    }

    async fetchThumbnailForAttachment(attachmentObjId) {
        const resizedPrefix = "resized-" + attachmentObjId;
        const signedUrl = await getSignedObjectUrl(resizedPrefix);
        this.setState({ thumbnailURL: signedUrl });
    } 

    async openAttachmentBtnPressed() {
        const isNewBucket = this.state.isNewBucket;
        const objectId = this.state.pagoObjId;
        if (isNewBucket) {
            const signedUrl = await getSignedObjectUrl(objectId);
            this.openWebBrowser(signedUrl);
        } else {
            console.log("OLD BUCKET");
            const signedUrl = await getOLDS3SignedUrl(objectId);
            this.openWebBrowser(signedUrl);
        }
    }

    async openWebBrowser(urlString) {
        await WebBrowser.openBrowserAsync(urlString);
    }

    cameraActionBtnPressed() {
        if (!this.state.showCamera && this.state.imageURL.length == 0) {
            //this.setState({ showCamera: true });
            this.adjuntarImagenShowOptions();
        } else {
            this.setState({ isLoading: true }, () => {
                this.savePagoImage();
            });
        }
    }

    adjuntarImagenShowOptions() {
        var options = [];
        let cameraRollAction = {text: 'Álbum de fotos', onPress: () => this._pickImage(), style: 'default'};
        options.push(cameraRollAction);
        //
        var cameraAction = {text: 'Cámara', onPress: () => this.launchCamera(), style: 'default'};
        options.push(cameraAction);
        //
        let cancelAction = {text: 'Cancelar', onPress: null, style: 'cancel'};
        options.push(cancelAction);

        Alert.alert(
          "Adjuntar Imagen",
          "Selecciona una opción",
          options,
          {cancelable: true},
        );
    }

    _pickImage = async () => {
        // No permission check needed for Android - Photo Picker handles this
        // Only perform permission checks on iOS
        let canProceed = true;

        if (Platform.OS === 'ios') {
            // On iOS, we still need to check for permission
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            canProceed = status === 'granted';
        }

        if (canProceed) {
            let result = await ImagePicker.launchImageLibraryAsync({
                mediaTypes: ImagePicker.MediaTypeOptions.Images,
                allowsEditing: false,
                aspect: [4, 3],
            });

            if (!result.canceled) {
                let assetURI = result.assets[0].uri;

                // Check for unsupported file types (HEIC/HEIF)
                const fileExtension = assetURI.split('.').pop().toLowerCase();
                const mimeType = result.assets[0].mimeType?.toLowerCase() || '';

                if (fileExtension === 'heic' || fileExtension === 'heif' ||
                    mimeType.includes('heic') || mimeType.includes('heif')) {
                    Alert.alert(
                        "Formato no soportado",
                        "El archivo seleccionado es de tipo HEIC que no es compatible. Por favor selecciona una imagen en formato JPG o PNG.",
                        [{ text: 'Ok', style: 'default' }]
                    );
                    return;
                }

                let assetHeight = result.assets[0].height;
                let assetWidth = result.assets[0].width;
                let assetBase64 = result.assets[0].base64;

                let newImageHeight = assetHeight / 8;
                let newImageWidth = assetWidth / 8;
                this.setState({ showCamera: false, imageURL: assetURI, imgTakenBase64: assetBase64, actionBtnText: "Enviar Pago", imageHeight: newImageHeight, imageWidth: newImageWidth });
            }
        } else {
            Alert.alert("Permiso denegado", "La app necesita acceso a tus fotos para adjuntar imágenes.");
        }
    };

    launchCamera = async () => {
        this.setState({ hasCameraPermission: true, showCamera: true });
    }

    // Images
    _requestCameraPermission = async () => {
        const { status } = await Camera.requestPermissionsAsync();
        this.setState({
          hasCameraPermission: status === 'granted',
        });
    };

    addImagesBtnPressed = async () => {
        // No permission check needed for Android - Photo Picker handles this
        // Only perform permission checks on iOS if needed
        let canProceed = true;

        if (Platform.OS === 'ios') {
            // On iOS, we still need to check for permission
            const { status } = await ImagePicker.requestMediaLibraryPermissionsAsync();
            canProceed = status === 'granted';
        }

        if (canProceed) {
            let result = await ImagePicker.launchImageLibraryAsync({
              allowsEditing: true,
              aspect: [4, 3],
            });

            if (!result.canceled) {
                const imageURI = result.assets[0].uri;

                // Check for unsupported file types (HEIC/HEIF)
                const fileExtension = imageURI.split('.').pop().toLowerCase();
                const mimeType = result.assets[0].mimeType?.toLowerCase() || '';

                if (fileExtension === 'heic' || fileExtension === 'heif' ||
                    mimeType.includes('heic') || mimeType.includes('heif')) {
                    Alert.alert(
                        "Formato no soportado",
                        "El archivo seleccionado es de tipo HEIC que no es compatible. Por favor selecciona una imagen en formato JPG o PNG.",
                        [{ text: 'Ok', style: 'default' }]
                    );
                    return;
                }

                const imageType = result.assets[0].type;
                var imagesArr = this.state.siteImgsArr;
                var data = { 'key' : imageURI };
                imagesArr.push(data);
                this.setState({ siteImgsArr: imagesArr });
            }
        }
    };

    snapPhoto = async () => {
        if (this.cameraRef.current) {
            let photo = await this.cameraRef.current.takePictureAsync();
            let newImageHeight = photo.height / 5;
            let newImageWidth = photo.width / 5;
            this.setState({
                showCamera: false,
                imageURL: photo.uri,
                imgTakenBase64: photo.base64,
                actionBtnText: "Enviar Pago",
                imageHeight: newImageHeight,
                imageWidth: newImageWidth
            });
        }
    };

    eliminarFoto() {
        this.setState({ imgTakenURI: null });
    }
    
    savePagoImage() {
        console.log("RUNNING savePagoImage");
        // 0. Get current User
        this.getCurrentUser();
        // 1. Retreive Pago object from Parse
        // 2. Set new values to Parse object. updatePagoObjectWithNewStatus()
        // 3. Save Parse Object
        // 4. On success, upload image to AWS
        // 5. Update pago status on screen
        // 6. Give feedback to user on screen
        // Parse cloud
    }

    getCurrentUser() {
        Parse.User.currentAsync().then(function(user) {
            if (user != null) {
                // do stuff with your user
                this.currentUser = user;
                this.currentEscuela = user.get('escuela');
                this.retreiveExistingPagoObject();
            } else {
                this.presentSessionLogOutAlert();
            }
        }.bind(this));
    }

    presentSessionLogOutAlert() {
        Alert.alert(
            'Tu sesión ha expirado.',
            'Es necesario que inicies sesión con tu credencial de nuevo. La pantalla para iniciar sesión se va a presentar a continuación.',
            [
              {text: 'Ok', style: 'default', onPress: () => this.userLogOut()},
            ]
        );
    }

    userLogOut() {
        // Remove Expo Push token
        this.removeExpoPushToken();
        // Remove Async Keys: userEstudianteIDs
        let asKeysArr = ['userEstudianteIDs', 'qrCodeStringAS', 'paqueteAlumnoAS', 'nombreAlumnoAS', 'parentescoPersonaAutorizadaAS', 'nombrePersonaAutorizadaAS', 'userPhotURLAS', 'userPlantel'];
        AsyncStorage.multiRemove(asKeysArr, (err) => {
            if (err) {
                console.log("All Keys Removed ERROR: " + JSON.stringify(err));
            } else {
                console.log("All AS Keys Removed.");
            }
          });
        // Parse log out
        Parse.User.logOut().then(() => {
          //var currentUser = Parse.User.current();
          console.log("USER LOGGED OUT...");
          this.props.navigation.navigate('Auth');
        });
    }

    async removeExpoPushToken() {
        try {
            const expoPushToken = await AsyncStorage.getItem('expoPushToken');
            if (expoPushToken !== null) {
                //console.log("REMOVE ExpoToken: " + expoPushToken);
                let results = this.state.estudianteObjects; // will this work in every scenario??
                for (let i = 0; i < results.length; i++) {
                    var estudianteObj = results[i];
                    // Check if object has array
                    var tokensArr = [];
                    if (estudianteObj.get('expoPushToken')) {
                        tokensArr = estudianteObj.get('expoPushToken');
                        //console.log("Estudiante TOkenArr: " + JSON.stringify(tokensArr));
                        if (tokensArr.includes(expoPushToken)) {
                            var index = tokensArr.indexOf(expoPushToken);
                            tokensArr.splice(index, 1);
                            // Update Parse Object
                            estudianteObj.set("expoPushToken", tokensArr);
                            estudianteObj.save().then((estudianteUpdated) => {
                                tokensArr.length = 0;
                                //console.log("EstudianteUpdated TokenArr: " + JSON.stringify(estudianteUpdated.get('expoPushToken')));
                            });
                        } else { // Skip iteration.
                            continue; 
                        }
                    } 
                }
            }
        } catch (error) { // Error retrieving data
            console.log("ERROR retreiving expoPushToken");
        }
    }

    retreiveExistingPagoObject() {
        var Pago = Parse.Object.extend("pagos");
        var query = new Parse.Query(Pago);
        query.get(this.state.pagoObjId)
        .then((pagoFetched) => {
            // The object was retrieved successfully.
            // First upload the image, then update the Pago object
            this.uploadImageToAWS(pagoFetched);
        }, (error) => {
            this.setState({ isLoading: false });
            this.presentFeedback("Algo inesperado", "Hubo un error al enviar el comprobante de pago. Intenta de nuevo, por favor. [01]", false);
        });
    }

    async uploadImageToAWS(pagoObj) {
        // Upload image to S3 using the Pago's objectId as the key
        const pagoObjId = pagoObj.id;
        let contentTypeString = 'image/jpg';
        try {
            await uploadImageDataToAWS(pagoObjId, this.state.imageURL, contentTypeString, true);
            // Only update the Pago object AFTER successful upload
            this.updatePagoObjectWithNewStatus(pagoObj);
        } catch (error) {
            console.log("Error uploading to AWS:", error);
            this.setState({ isLoading: false });
            this.presentFeedback("Algo inesperado", 'Hubo un error al intentar guardar el archivo. Intenta de nuevo por favor.', false);
        }
    }

    updatePagoObjectWithNewStatus(pagoObj) {
        // Set flags AFTER successful S3 upload
        pagoObj.set("user", this.currentUser);
        pagoObj.set("newS3Bucket", true);
        pagoObj.set("pagado", true);
        pagoObj.set("sentFrom", "RN");
        pagoObj.save()
        .then((pagoUpdated) => {
            this.triggerCloudCode(pagoUpdated.id);
        }, (error) => {
            console.log('Error Parse Save:', error);
            this.setState({ isLoading: false });
            this.presentFeedback("Algo inesperado", "Hubo un error al enviar el comprobante de pago. Intenta de nuevo, por favor. [02]", false);
        });
    }

    async triggerCloudCode(pagoId) {
        console.log("RUNNING triggerCloudCode");
        // pagoAdminNotification - now uses standardized response format
        const escuelaObjId = this.currentEscuela.id;
        const params = { pagoId: pagoId, escuelaObjId: escuelaObjId };

        const result = await callCloudFunction("pagoAdminNotification", params, {
            legacySuccessValue: 'pago fetched correctly', // Legacy format
        });

        if (result.success) {
            console.log("Cloud result:", result.data);
            trackEvent("pago_comprobante_upload", {
                escuela: this.currentEscuela ? this.currentEscuela.id : "",
                pagoId: pagoId
            });
            this.setState({ isLoading: false, pagoStatus: 'Pagado' }, () => {
                DeviceEventEmitter.emit("refreshEdoCuentaList");
                this.presentFeedback("Pago enviado", "El pago fue enviado a la Escuela exitosamente.", true);
            });
        } else {
            console.log("Cloud error:", result.error);
            this.setState({ isLoading: false, pagoStatus: 'Pagado' }, () => {
                this.presentFeedback(
                    result.error.title || "Algo inesperado",
                    "El pago fue enviado pero no pudimos notificar a la Escuela. Notifica a la Escuela de tu pago, por favor.",
                    false
                );
            });
        }
    }

    tarjetaBtnPressed() {
        //Amplitude.logEvent("pagoStripeNav");
        this.props.navigation.navigate("AddSubscription", {stripeConnectAccntId: this.state.stripeConnectAccntId, stripeCommissionPercent: this.state.stripeCommissionPercent, pagoCantidad: this.state.pagoCantidad, pagoObjId: this.state.pagoObjId, pagoConcepto: this.state.pagoConcepto, stripePagoSuccess: this.stripePagoSuccess.bind(this)});
    }

    stripePagoSuccess() {
        console.log("RUNNING stripePagoSuccess");
        // Hide buttons
        this.setState({pagoStatus: "Pagado", isStripeActive: false}, () => {
            this.triggerCloudCode(this.state.pagoObjId);
        });
    }


    presentFeedback(alertTitle, alertMessage, isFinal) {
        var options = [];
        var params = {text: 'Ok', onPress: null, style: 'default'};
        if (isFinal) {
            params = {text: 'Ok', onPress: () => this.props.navigation.goBack(), style: 'default'};
        }
        options.push(params);
        Alert.alert(
          alertTitle,
          alertMessage,
          options,
          {cancelable: false},
        );
    }

    

    render() {
        const { hasCameraPermission } = this.state;
        return (
            <SafeAreaView style={styles.safeArea}>
                    <View style={styles.topRowView}>
                        <TouchableOpacity onPress={this.backBtnPressed.bind(this)}>
                            <Text style={styles.headerBtnText}>{"< Atrás"}</Text>
                        </TouchableOpacity>
                    </View>
                    <View style={styles.dividerView}></View>
                    <View style={styles.container}>
                        <ScrollView contentContainerStyle={styles.contentContainer}>
                            <View style={{alignItems: 'center', marginTop: 16}}>
                                <Text style={styles.titleText}>Detalle de Pago</Text>
                            </View>
                            <View style={styles.cardContainer}>
                                <Text style={{color: 'white', fontSize: 22, fontWeight: '800', marginBottom: 8}}>{this.state.pagoConcepto}</Text>
                                <Text style={{color: 'white', fontSize: 20, fontWeight: '600', marginBottom: 8}}>{"$"+this.state.pagoCantidad}</Text>
                                <Text style={{color: 'white', fontSize: 16, fontWeight: '400', marginBottom: 8}}>{this.state.pagoEstudiante}</Text>
                                <Text style={{color: 'white', fontSize: 16, fontWeight: '300', marginBottom: 8}}>{this.state.pagoFecha}</Text>
                                <Text style={{color: this.state.pagoStatus == 'Pendiente' ? Colors.bittersweetDark : 'white', fontSize: 16, fontWeight: this.state.pagoStatus == 'Pendiente' ? '800' : '300', marginBottom: 8}}>{this.state.pagoStatus}</Text>
                                {
                                    this.state.paidWithStripe && (
                                        <Text style={{color: 'white', fontSize: 16, fontWeight: '600', marginBottom: 8}}>Cargo a tarjeta bancaria: ${this.state.stripeChargeAmount}</Text>
                                    )
                                }
                                {
                                    this.state.hasRecibo && (
                                        <Text style={{color: 'white', fontSize: 16, fontWeight: '300', marginBottom: 8}}>{"Folio recibo: " + this.state.folioRecibo}</Text>
                                    )
                                }
                            </View>

                            {
                                this.state.hasAttachment && (
                                    <View style={{alignItems: 'center', marginTop: 16}}>
                                        <TouchableOpacity onPress={this.openAttachmentBtnPressed.bind(this)}>
                                            <View style={{flexDirection: 'row', alignItems: 'center', padding: 4}}>
                                                <Image
                                                    style={styles.attachmentImage}
                                                    source={require('../assets/images/attachmentIconWhite.png')}
                                                />
                                                <Text style={styles.adjuntoBtn}>Abrir Adjunto</Text>
                                            </View>
                                        </TouchableOpacity>
                                    </View>
                                )
                            }
                            {this.state.thumbnailURL.length > 0 && (
                                <View style={[
                                    styles.thumbnailContainer,
                                ]}>
                                    <Image style={styles.attachmentThumbnail} source={{ uri: this.state.thumbnailURL }} />
                                </View>
                            )}
                            {
                                this.state.hasRecibo && (
                                    <View style={{alignItems: 'center', marginTop: 16}}>
                                        <TouchableOpacity onPress={this.openAttachmentBtnPressed.bind(this)}>
                                            <View style={{flexDirection: 'row', alignItems: 'center', padding: 4}}>
                                                <Image
                                                    style={styles.reciboEmitidoIcon}
                                                    source={require('../assets/images/reciboEmitidoBlancoIcon.png')}
                                                />
                                                <Text style={styles.adjuntoBtn}>Ver Recibo</Text>
                                            </View>
                                        </TouchableOpacity>
                                    </View>
                                )
                            }
                            {
                                this.state.pagoStatus != "Pagado" && this.state.isStripeActive && this.state.pagoCantidad > 0 && (
                                    <View style={styles.actionButtonContainerView}>
                                        <TouchableOpacity onPress={this.tarjetaBtnPressed.bind(this)} style={styles.pagarTarjetaBtn}>
                                            <Text style={styles.pagarTarjetaButtonText}>Pagar con tarjeta bancaria</Text>
                                        </TouchableOpacity>
                                    </View>

                                )
                            }
                            {
                                this.state.pagoStatus == "Pendiente" && !this.state.isLoading ? (
                                    <View style={styles.actionButtonContainerView}>
                                        <TouchableOpacity onPress={this.cameraActionBtnPressed.bind(this)}>
                                            <Text style={styles.actionBtnText}>{this.state.actionBtnText}</Text>
                                        </TouchableOpacity>
                                    </View>
                                ) : (
                                    <ActivityIndicator size="large" color="#ffff" animating={this.state.isLoading} style={{marginTop: 4}} hidesWhenStopped={true}/>
                                )
                            }
                            {
                                this.state.imageURL.length > 0 && (
                                    <Image
                                        style={{height: this.state.imageHeight, width: this.state.imageWidth, borderRadius: 5, marginTop: 16, marginBottom: 16}}
                                        source={{uri: this.state.imageURL}}
                                    />
                                )
                            }
                            
                          
                        </ScrollView>
                    </View>

                    
                    

                    { // CAMERA VIEW
                        this.state.showCamera && (
                            <View style={{ flex: 1, height: '95%' }}>
                                <CameraView ref={this.cameraRef} style={{ flex: 1 }}>
                                    <View style={{
                                        flex: 1,
                                        backgroundColor: 'transparent',
                                        flexDirection: 'row',
                                        justifyContent: 'space-between'
                                    }}>
                                        <TouchableOpacity
                                            style={{
                                                alignSelf: 'flex-end',
                                                alignItems: 'center',
                                            }}
                                            onPress={() => {
                                                this.setState(prevState => ({
                                                    facing: prevState.facing === 'back' ? 'front' : 'back',
                                                }));
                                            }}>
                                            <Text style={{ fontSize: 18, marginBottom: 10, color: 'white' }}> Voltear </Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={{
                                                alignSelf: 'flex-end',
                                                alignItems: 'center',
                                            }}
                                            onPress={() => this.snapPhoto()}>
                                            <Text style={{ fontSize: 18, marginBottom: 10, color: 'white', fontWeight: '700' }}> Tomar foto </Text>
                                        </TouchableOpacity>
                                        <TouchableOpacity
                                            style={{
                                                alignSelf: 'flex-end',
                                                alignItems: 'center',
                                            }}
                                            onPress={() => this.setState({ showCamera: false })}>
                                            <Text style={{ fontSize: 18, marginBottom: 10, color: 'red' }}> Cerrar </Text>
                                        </TouchableOpacity>
                                    </View>
                                </CameraView>
                            </View>
                        )
                    }
                    
            </SafeAreaView>
        )
    }
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1, 
        backgroundColor: Colors.aquaLight
    },
    headerBtnText: {
        color: Colors.actionColor,
        fontWeight: '600'
    },
    actionBtnText: {
        color: Colors.actionColor,
        fontWeight: '600',
        fontSize: 18
    },
    container: {
      flex: 1,
      paddingTop: 4,
      backgroundColor: Colors.aquaLight,
    },
    cardContainer: {
        marginLeft: 16, 
        marginRight: 16, 
        backgroundColor: Colors.aquaDark, 
        padding: 8, 
        borderRadius: 8, 
        marginBottom: 24,
        width: screenWidth - 32
    },
    topRowView: {
        paddingLeft: 8,
        paddingRight: 8,
        paddingTop: Platform.OS === 'ios' ? 8 : 28,
        paddingBottom: -2,
        flexDirection: 'row', 
        justifyContent: 'space-between',
    },
    rowView: {
        flexDirection: 'row', 
        justifyContent: 'space-between',
        alignItems: 'center'
    },
    dividerView: {
        height: 2,
        backgroundColor: Colors.aquaDark,
        marginTop: 4
    },
    contentContainer: {
        backgroundColor: Colors.aquaLight,
        alignItems: 'center'
    },
    titleText: {
        color: 'white',
        fontSize: 18,
        fontWeight: '600',
        marginBottom: 16
    },
    placeholderLabel: {
        color: Colors.mediumGrayLight,
        fontSize: 15,
    },  
    valueLabel: {
        color: 'white',
        fontWeight: '500',
        fontSize: 17
    },
    labelText: {
        color: 'white',
        fontSize: 16,
        fontWeight: '400',
        width: 110
    },
    textInputShort: {
        height: 30,
        marginTop: 8,
        marginLeft: 8,
        width: 200, 
        backgroundColor: 'white',
        paddingLeft: 8,
        marginBottom: 16,
        borderRadius: 5,
        fontSize: 16,
    },
    adjuntoBtn: {
        color: Colors.actionColor,
        fontWeight: '600',
        fontSize: 18,
    },
    attachmentImage: {
        height: 20,
        width: 20,
    },
    reciboEmitidoIcon: {
        height: 20,
        width: 20,
        marginRight: 6
    },
    pagoImgContainer: {
        marginLeft: 32, 
        marginRight: 32, 
        backgroundColor: Colors.aquaDark, 
        padding: 8, 
        borderRadius: 8, 
        marginBottom: 8,
        alignItems: 'center'
    },
    pagoCameraImage: {
        height: 340,
        width: 240,
        borderRadius: 5
    },
    pagarTarjetaBtn: {
        backgroundColor: Colors.grassLight,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
        marginBottom: 24,
        borderRadius: 8,
        width: '90%',
    },
    pagarTarjetaButtonText: {
        color: 'white',
        fontSize: 20,
        fontWeight: '600'
    },
    actionButtonContainerView: {
        alignItems: 'center', 
        marginBottom: 24, 
        width: '100%'
    },
    thumbnailContainer: {
        marginTop: 8,
        backgroundColor: 'white',
        padding: 4,
        borderRadius: 4,
        shadowColor: '#000',
        shadowOffset: {
            width: 0,
            height: 2,
        },
        shadowOpacity: 0.25,
        shadowRadius: 3.84,
        elevation: 5,
    },
    attachmentThumbnail: {
        width: 55,
        height: 44,
        resizeMode: 'cover',
        borderRadius: 2,
    },
});