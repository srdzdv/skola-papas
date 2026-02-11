import React, { useState, useEffect, useCallback, memo } from 'react';
import { trackEvent } from "@aptabase/react-native";
var Parse = require('parse/react-native');
import Colors from '../constants/Colors';
import dayjs from '../utils/dayjs';
import Hyperlink from 'react-native-hyperlink'
import { MaterialIcons } from '@expo/vector-icons';
import {
  SafeAreaView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  Pressable,
  View,
  Dimensions,
  ActivityIndicator,
  TextInput,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { FlashList } from '@shopify/flash-list';
import { WebView } from 'react-native-webview';
import * as WebBrowser from 'expo-web-browser';
import { getSignedObjectUrl } from '../s3API';
const screenWidth = Dimensions.get('window').width;
const midScreen = screenWidth / 2;

// Memoized thumbnail component for gallery
const GalleryThumbnail = memo(function GalleryThumbnail({
    item,
    index,
    total,
    onPress
}) {
    const isVideo = item.tipo === "VID";

    return (
        <Pressable onPress={onPress} style={styles.galleryItem}>
            {item.thumbnailUrl ? (
                <View style={styles.thumbnailWrapper}>
                    <Image
                        source={{ uri: item.thumbnailUrl }}
                        style={styles.galleryThumbnail}
                        contentFit="cover"
                        transition={200}
                    />
                    {isVideo && (
                        <View style={styles.videoIconOverlaySmall}>
                            <MaterialIcons
                                name="videocam"
                                size={20}
                                color={Colors.bluejeansDark}
                            />
                        </View>
                    )}
                    {total > 1 && (
                        <View style={styles.indexBadge}>
                            <Text style={styles.indexBadgeText}>{index + 1}</Text>
                        </View>
                    )}
                </View>
            ) : (
                <View style={styles.noThumbnailButton}>
                    <MaterialIcons
                        name={isVideo ? "videocam" : item.tipo === "PDF" ? "picture-as-pdf" : "image"}
                        size={24}
                        color={Colors.darkGrayDark}
                    />
                    <Text style={styles.noThumbnailText}>{index + 1}</Text>
                </View>
            )}
        </Pressable>
    );
});

// Multiple images gallery component
const MultipleImagesGallery = memo(function MultipleImagesGallery({
    attachments,
    onImagePress
}) {
    const renderItem = useCallback(({ item, index }) => (
        <GalleryThumbnail
            item={item}
            index={index}
            total={attachments.length}
            onPress={() => onImagePress(item)}
        />
    ), [attachments.length, onImagePress]);

    const keyExtractor = useCallback((item) => item.objectId, []);

    return (
        <View style={styles.galleryContainer}>
            <Text style={styles.galleryTitle}>
                {attachments.length} {attachments.length === 1 ? 'imagen adjunta' : 'imagenes adjuntas'}
            </Text>
            <FlashList
                data={attachments}
                renderItem={renderItem}
                keyExtractor={keyExtractor}
                horizontal
                showsHorizontalScrollIndicator={false}
                estimatedItemSize={100}
                contentContainerStyle={styles.galleryList}
            />
        </View>
    );
});

export default function AnuncioDetail({ navigation, route }) {
    // Navigation Parameters
    const navParams = route.params;

    // Derived initial values
    const initialIsDeepLink = !!navParams.deepObjId;
    const initialAnuncioObjId = navParams.deepObjId || navParams.anuncioObj?.id || "";
    const initialTipo = navParams.anuncioObj?.tipo || "";
    const initialTimestamp = navParams.anuncioObj?.timestamp || "";

    // State
    const [isDeepLink] = useState(initialIsDeepLink);
    const [anuncioObjId] = useState(initialAnuncioObjId);
    const [tipoAnuncio, setTipoAnuncio] = useState(initialTipo);
    const [anuncioCreatedAt, setAnuncioCreatedAt] = useState(initialTimestamp);
    const [anuncioDestino, setAnuncioDestino] = useState("");
    const [anuncioDescripcion, setAnuncioDescripcion] = useState("");
    const [anuncioAutor, setAnuncioAutor] = useState("");
    const [tareaFechaEntrega, setTareaFechaEntrega] = useState("");
    const [isMomentos, setIsMomentos] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const [attachmentURL, setAttachmentURL] = useState("");
    const [currentEstudiante, setCurrentEstudiante] = useState("");
    const [currentEscuela, setCurrentEscuela] = useState(null);

    // Multiple attachments state
    const [attachmentsData, setAttachmentsData] = useState([]);

    // Refs
    const currentUserRef = React.useRef(null);

    // Calculate text input height based on screen
    const descripcionTextInputHeight = React.useMemo(() => {
        const screenHeight = Dimensions.get('window').height;
        return screenHeight > 700 ? 480 : 350;
    }, []);

    // Fetch all photos for an anuncio (multiple photos support)
    const fetchAnuncioPhotos = useCallback(async (anuncioObj) => {
        try {
            const Anuncio = Parse.Object.extend("anuncio");
            const innerQuery = new Parse.Query(Anuncio);
            innerQuery.equalTo("objectId", anuncioObj.id);

            const AnuncioPhoto = Parse.Object.extend("AnuncioPhoto");
            const query = new Parse.Query(AnuncioPhoto);
            query.matchesQuery("anuncio", innerQuery);
            query.ascending("createdAt");

            const results = await query.find();

            if (results.length === 0) return [];

            // Fetch thumbnails for photos with newS3Bucket
            const attachments = await Promise.all(
                results.map(async (photo) => {
                    const objectId = photo.id;
                    const tipo = photo.get('TipoArchivo') || "";
                    const isNewBucket = photo.get('newS3Bucket') || false;

                    let thumbnailUrl = "";
                    if (isNewBucket && (tipo === "JPG" || tipo === "VID")) {
                        try {
                            const resizedObjectId = `resized-${objectId}`;
                            // Use getSignedObjectUrl which handles the new API response format
                            thumbnailUrl = await getSignedObjectUrl(resizedObjectId);
                        } catch (err) {
                            console.log("Error fetching thumbnail:", err);
                        }
                    }

                    return {
                        objectId,
                        tipo,
                        isNewBucket,
                        thumbnailUrl
                    };
                })
            );

            return attachments;
        } catch (error) {
            console.log("Error fetching anuncio photos:", error);
            return [];
        }
    }, []);

    // Helper to get grupo IDs
    const getGrupoIDs = useCallback((gruposArr) => {
        if (gruposArr.length > 4) {
            return "Toda la escuela";
        }
        let grupoIDsStrings = "";
        for (let i = 0; i < gruposArr.length; i++) {
            const grupoObj = gruposArr[i];
            if (grupoObj != null) {
                const grupoID = grupoObj.get("grupoId");
                if (gruposArr.length > 1) {
                    grupoIDsStrings = grupoIDsStrings + grupoID + ", ";
                } else {
                    grupoIDsStrings = grupoID;
                }
            }
        }
        return grupoIDsStrings;
    }, []);

    // Process momento data
    const processMomento = useCallback((momentoData) => {
        let desayunoString = "";
        let comidaString = "";
        let colacionString = "";
        let meriendaString = "";
        let lecheString = "";
        let descansoString = "";
        let duracionSiestaString = "";
        let horaSiestaString = "";
        let funcionAvisoString = "";
        let pipiString = "";
        let popoString = "";

        if (momentoData.desayuno?.length > 0) {
            desayunoString = "Desayuno: " + momentoData.desayuno + "\r\n";
        }
        if (momentoData.comida?.length > 0) {
            comidaString = "Comida: " + momentoData.comida + "\r\n";
        }
        if (momentoData.colacion?.length > 0) {
            colacionString = "Colación: " + momentoData.colacion + "\r\n";
        }
        if (momentoData.merienda?.length > 0) {
            meriendaString = "Merienda: " + momentoData.merienda + "\r\n";
        }
        if (momentoData.leche?.length > 0) {
            lecheString = "\r\n🍼Leche: " + momentoData.leche + "\r\n";
        }

        descansoString = momentoData.descanso === true ? "Durmió: Sí" : "Durmió: No";
        if (momentoData.tiempoSiesta?.length > 0) {
            duracionSiestaString = "Tiempo: " + momentoData.tiempoSiesta + "\r\n";
        }
        if (momentoData.horaSiesta?.length > 0) {
            horaSiestaString = "Horario: " + momentoData.horaSiesta + "\r\n";
        }

        funcionAvisoString = momentoData.avisoFuncion === true ? "Avisó: Sí" : "Avisó: No";
        if (momentoData.pipi?.length > 0) {
            pipiString = "Pipí: " + momentoData.pipi + "\r\n";
        }
        if (momentoData.popo?.length > 0) {
            popoString = "Popó: " + momentoData.popo + "\r\n";
        }

        const comentariosString = momentoData.alimentosComentarios || "";
        return "🥗Alimentación\r\n" + desayunoString + comidaString + colacionString + meriendaString + lecheString +
            "\r\n😴Descanso\r\n" + descansoString + "\r\n" + duracionSiestaString + horaSiestaString +
            "\r\n🚽Funciones\r\n" + funcionAvisoString + "\r\n" + pipiString + popoString +
            "\r\n📝Comentarios generales:\r\n" + comentariosString;
    }, []);

    // Record activity
    const recordActivityAction = useCallback(async (anuncioObj) => {
        try {
            const Actividad = Parse.Object.extend("actividad");
            const actividad = new Actividad();
            actividad.set("anuncioID", anuncioObj);
            actividad.set("userID", currentUserRef.current);
            actividad.set("tipo", "seen");
            await actividad.save();
            console.log('Activity created');
        } catch (error) {
            console.log('Activity Failed to create, error code: ' + error.message);
        }
    }, []);

    // Check for existing activity
    const getActivityForAnuncio = useCallback(async (anuncioObj) => {
        const Actividad = Parse.Object.extend("actividad");
        const query = new Parse.Query(Actividad);
        query.equalTo("anuncioID", anuncioObj);
        query.equalTo("userID", currentUserRef.current);
        query.equalTo("tipo", "seen");
        const activity = await query.first();
        if (activity == null) {
            recordActivityAction(anuncioObj);
        }
    }, [recordActivityAction]);

    // Get anuncio details
    const getAnuncioDetails = useCallback(async () => {
        try {
            const Anuncio = Parse.Object.extend("anuncio");
            const query = new Parse.Query(Anuncio);
            query.include("autor");
            query.include("estudiante");
            query.include("grupos");

            const anuncio = await query.get(anuncioObjId);
            const autorObj = anuncio.get("autor");
            const autorNombre = autorObj.get("parentesco");

            // Fetch all photos (multiple photos support)
            const photos = await fetchAnuncioPhotos(anuncio);
            setAttachmentsData(photos);

            if (isDeepLink) {
                let tipo = "Mensaje";
                if (anuncio.get('tipo') != null) {
                    tipo = anuncio.get('tipo').get('nombre');
                }
                if (anuncio.get('momento') != null) {
                    tipo = "Momentos del Día";
                }
                const timestamp = dayjs(anuncio.createdAt).format("dd DD/MMM");
                setAnuncioCreatedAt(timestamp);
                setTipoAnuncio(tipo);
            }

            // Destinatario
            let estudianteObj = null;
            let anuncioDestinoString = "";
            if (anuncio.get("estudiante")) {
                estudianteObj = anuncio.get("estudiante");
                anuncioDestinoString = estudianteObj.get("NOMBRE");
            } else if (anuncio.get("grupos")) {
                const gruposArr = anuncio.get("grupos");
                anuncioDestinoString = getGrupoIDs(gruposArr);
            }

            // Descripcion
            let descripcion = "";
            if (anuncio.get("descripcion")) {
                descripcion = anuncio.get("descripcion");
            }

            // Momento
            let momentos = false;
            if (anuncio.get('momento')) {
                descripcion = processMomento(anuncio.get('momento'));
                momentos = true;
            }

            // Fecha de entrega
            let fechaEntrega = "";
            if (anuncio.get('fechaEntrega')) {
                const materiaString = anuncio.get('materia') || "";
                fechaEntrega = materiaString + " | Entrega: " + dayjs(anuncio.get('fechaEntrega')).format("dd DD/MMM");
            }

            setAnuncioDescripcion(descripcion);
            setAnuncioAutor(autorNombre);
            setAnuncioDestino(anuncioDestinoString);
            setCurrentEstudiante(estudianteObj?.id || "");
            setTareaFechaEntrega(fechaEntrega);
            setIsMomentos(momentos);
            setIsLoading(false);

            getActivityForAnuncio(anuncio);
        } catch (error) {
            console.log("Error fetching anuncio:", error);
            setIsLoading(false);
        }
    }, [anuncioObjId, isDeepLink, fetchAnuncioPhotos, getGrupoIDs, processMomento, getActivityForAnuncio]);

    // Get current user
    const getCurrentUser = useCallback(async () => {
        const user = await Parse.User.currentAsync();
        currentUserRef.current = user;
        const escuela = user?.get('escuela');
        setCurrentEscuela(escuela);
    }, []);

    // Load data on mount
    useEffect(() => {
        getCurrentUser();
        getAnuncioDetails();
    }, [getCurrentUser, getAnuncioDetails]);

    // Handlers
    const handleBack = useCallback(() => {
        navigation.goBack();
    }, [navigation]);

    const handleResponder = useCallback(() => {
        navigation.navigate('Escribir', { currentEstudiante });
    }, [navigation, currentEstudiante]);

    const handleOpenAttachment = useCallback(async (attachment) => {
        trackEvent("anuncio_attachment_view", {
            escuela: currentEscuela?.id || "",
            attachmentType: attachment.tipo || ""
        });

        try {
            // Fetch the full-size signed URL for the attachment
            const fullSizeUrl = await getSignedObjectUrl(attachment.objectId);

            navigation.navigate("AttachmentDetail", {
                objectId: attachment.objectId,
                tipo: attachment.tipo,
                fullSizeUrl: fullSizeUrl,
                newS3Bucket: attachment.isNewBucket
            });
        } catch (error) {
            console.log("Error fetching attachment URL:", error);
            Alert.alert(
                "Error",
                "No se pudo cargar el adjunto. Intenta de nuevo.",
                [{ text: "Ok" }]
            );
        }
    }, [navigation, currentEscuela]);

    // For single attachment display (backward compatible)
    const singleAttachment = attachmentsData.length === 1 ? attachmentsData[0] : null;
    const hasMultipleAttachments = attachmentsData.length > 1;
    

    return (
        <SafeAreaView style={styles.safeArea}>
            <View style={styles.topRowView}>
                <Pressable onPress={handleBack} style={styles.attachmentButton}>
                    <Text style={styles.topButtonText}>{"< Atrás"}</Text>
                </Pressable>

                {/* Single attachment button (backward compatible) */}
                {singleAttachment && (
                    <Pressable
                        onPress={() => handleOpenAttachment(singleAttachment)}
                        style={styles.attachmentButton}
                    >
                        <Image
                            style={styles.attachmentImage}
                            source={require('../assets/images/attachmentIconBlack.png')}
                        />
                        <Text style={styles.topButtonText}>Abrir adjunto</Text>
                    </Pressable>
                )}

                {/* Single attachment thumbnail */}
                {singleAttachment?.thumbnailUrl ? (
                    <Pressable
                        onPress={() => handleOpenAttachment(singleAttachment)}
                        style={styles.thumbnailContainer}
                    >
                        <Image
                            style={styles.attachmentThumbnail}
                            source={{ uri: singleAttachment.thumbnailUrl }}
                            contentFit="cover"
                            transition={200}
                        />
                        {singleAttachment.tipo === "VID" && (
                            <View style={styles.videoIconOverlay}>
                                <MaterialIcons
                                    name="videocam"
                                    size={28}
                                    color={Colors.bluejeansDark}
                                />
                            </View>
                        )}
                    </Pressable>
                ) : null}

                <Pressable onPress={handleResponder} style={styles.attachmentButton}>
                    <Text style={styles.topButtonText}>{"Responder"}</Text>
                </Pressable>
            </View>

            <ScrollView contentContainerStyle={styles.contentContainer}>
                <View style={styles.headerContainer}>
                    <Text style={styles.titleText}>{tipoAnuncio}</Text>
                    <Text style={styles.subtitleText}>{`${anuncioAutor} → ${anuncioDestino}`}</Text>
                    <Text style={styles.dateText}>{`${anuncioCreatedAt} ${tareaFechaEntrega}`}</Text>
                </View>

                {/* Multiple attachments gallery */}
                {hasMultipleAttachments && (
                    <MultipleImagesGallery
                        attachments={attachmentsData}
                        onImagePress={handleOpenAttachment}
                    />
                )}

                <Hyperlink linkDefault={true}>
                    <TextInput
                        style={styles.descriptionInput}
                        multiline={true}
                        dataDetectorTypes={'link'}
                        scrollEnabled={true}
                        editable={Platform.OS === 'android' || isMomentos}
                        value={anuncioDescripcion}
                    />
                </Hyperlink>

                {attachmentURL.length > 0 && (
                    <View style={styles.webViewContainer}>
                        <WebView source={{ uri: attachmentURL }} />
                    </View>
                )}

                {isLoading && (
                    <ActivityIndicator
                        size="large"
                        color="#ffff"
                        animating={isLoading}
                        style={styles.loadingIndicator}
                        hidesWhenStopped={true}
                    />
                )}
            </ScrollView>
        </SafeAreaView>
    );
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1,
        backgroundColor: Colors.bluejeansLight,
    },
    topRowView: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        paddingHorizontal: 16,
        paddingTop: Platform.OS === 'ios' ? 16 : 36,
    },
    topButtonText: {
        color: Colors.darkGrayDark,
        fontWeight: '700',
        fontSize: 13,
    },
    contentContainer: {
        paddingVertical: 8,
        paddingHorizontal: 16,
    },
    headerContainer: {
        marginBottom: 24,
    },
    titleText: {
        color: 'white',
        fontSize: 24,
        fontWeight: 'bold',
        marginBottom: 8,
    },
    subtitleText: {
        color: 'white',
        fontSize: 18,
        marginBottom: 4,
    },
    dateText: {
        color: Colors.darkGrayDark,
        fontSize: 14,
    },
    attachmentButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.actionColor,
        padding: 12,
        borderRadius: 20,
        borderCurve: 'continuous',
        marginBottom: 16,
    },
    attachmentImage: {
        height: 20,
        width: 20,
        marginRight: 8,
    },
    descriptionInput: {
        backgroundColor: 'white',
        padding: 16,
        borderRadius: 8,
        borderCurve: 'continuous',
        fontSize: 17,
        textAlignVertical: 'top',
        height: 500,
        marginBottom: 16,
    },
    thumbnailContainer: {
        position: 'absolute',
        top: Platform.OS === 'ios' ? 58 : 78,
        left: midScreen + 30,
        transform: [{ rotate: '20deg' }],
        backgroundColor: 'white',
        padding: 4,
        borderRadius: 4,
        borderCurve: 'continuous',
        boxShadow: '0 2px 4px rgba(0, 0, 0, 0.25)',
    },
    attachmentThumbnail: {
        width: 55,
        height: 44,
        borderRadius: 2,
        borderCurve: 'continuous',
    },
    videoIconOverlay: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        justifyContent: 'center',
        alignItems: 'center',
        backgroundColor: 'white',
        borderRadius: 20,
        borderCurve: 'continuous',
    },
    webViewContainer: {
        flex: 1,
        height: 300,
    },
    loadingIndicator: {
        marginTop: 4,
    },
    // Multiple images gallery styles
    galleryContainer: {
        backgroundColor: Colors.bluejeansDark,
        padding: 12,
        borderRadius: 12,
        borderCurve: 'continuous',
        marginBottom: 16,
    },
    galleryTitle: {
        color: 'white',
        fontWeight: '600',
        fontSize: 14,
        marginBottom: 10,
    },
    galleryList: {
        paddingRight: 12,
    },
    galleryItem: {
        marginRight: 10,
    },
    thumbnailWrapper: {
        position: 'relative',
    },
    galleryThumbnail: {
        width: 90,
        height: 90,
        borderRadius: 8,
        borderCurve: 'continuous',
    },
    videoIconOverlaySmall: {
        position: 'absolute',
        top: 4,
        right: 4,
        backgroundColor: 'rgba(255, 255, 255, 0.9)',
        borderRadius: 12,
        borderCurve: 'continuous',
        padding: 4,
    },
    indexBadge: {
        position: 'absolute',
        bottom: 4,
        right: 4,
        backgroundColor: 'rgba(0, 0, 0, 0.6)',
        borderRadius: 10,
        borderCurve: 'continuous',
        paddingHorizontal: 6,
        paddingVertical: 2,
    },
    indexBadgeText: {
        color: 'white',
        fontSize: 11,
        fontWeight: '700',
    },
    noThumbnailButton: {
        width: 90,
        height: 90,
        borderRadius: 8,
        borderCurve: 'continuous',
        backgroundColor: Colors.actionColor,
        justifyContent: 'center',
        alignItems: 'center',
        gap: 4,
    },
    noThumbnailText: {
        color: Colors.darkGrayDark,
        fontSize: 12,
        fontWeight: '600',
    },
});