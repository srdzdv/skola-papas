import React from 'react';
import { trackEvent } from "@aptabase/react-native";
import AsyncStorage from '@react-native-async-storage/async-storage';
var Parse = require('parse/react-native');
import { AntDesign } from '@expo/vector-icons';
import Colors from '../constants/Colors';
import dayjs from '../utils/dayjs';
import {
  Image,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  ActivityIndicator,
  View,
  Dimensions,
  Alert,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

const screenWidth = Dimensions.get('window').width;

export default class EventoDetail extends React.Component {
    static navigationOptions = {
        header: null,
      };

    constructor(props) {
        super(props);
        //
        const eventoObject = props.route.params.eventoObj;
        const eventoNombreString = eventoObject.nombre;
        const eventoFecha = eventoObject.object.get('fecha');
        const eventoFechaString = dayjs(eventoFecha).format("dddd DD MMMM YYYY");
        const eventoHoraString = dayjs(eventoFecha).format("HH:mm");
        const eventoLugarString = eventoObject.object.get('lugar');
        const eventoDescripcionString = eventoObject.object.get('descripcion');
        const eventoHasAttachment = eventoObject.hasPhotos;
        const eventoPublicoStr = eventoObject.publico
        const eventoRSVPStr = eventoObject.rsvp
        const isPastEvent = eventoObject.isPastEvent
        const isRSVPRequired = eventoObject.isRSVPRequired
        const rsvpState = eventoRSVPStr == "Confirmada" ? true : false
        // Initial State
        this.state = { 
                       isLoading: false,
                       eventoNombre: eventoNombreString,
                       eventoFecha: eventoFechaString,
                       eventoHora: eventoHoraString,
                       eventoLugar: eventoLugarString,
                       eventoDescripcion: eventoDescripcionString,
                       hasAttachment: eventoHasAttachment,
                       eventoObject: eventoObject.object,
                       eventoPublico: eventoPublicoStr,
                       eventoRSVP: rsvpState,
                       isPastEvent: isPastEvent,
                       isRSVPRequired: isRSVPRequired
                     };
    }

    backBtnPressed() {
        this.props.navigation.goBack();
    }

    presentFeedback(alertTitle, alertMessage) {
        Alert.alert(
          alertTitle,
          alertMessage,
          [
            {text: 'Ok', onPress: null, style: 'default'},
          ],
          {cancelable: false},
        );
    }

    openAttachmentBtnPressed() {
        trackEvent("evento_photos_view", {
            escuela: this.state.eventoObject ? this.state.eventoObject.get('escuela')?.id : "",
            eventoId: this.state.eventoObject ? this.state.eventoObject.id : ""
        });
        this.props.navigation.navigate("EventoGallery", {eventoObj: this.state.eventoObject, eventoNombre: this.state.eventoNombre, eventoFecha: this.state.eventoFecha});
    }

    handleRSVPClick() {
        this.setState({isLoading: true})
        this.saveRSVP()
    }

    handleUnconfirmRSVP() {
        Alert.alert(
            "¿Deseas cancelar tu asistencia al evento?",
            "Selecciona una opción",
            [
              {text: 'Cancelar asistencia', onPress: () => this.deleteRSVPForUser(), style: 'destructive'},
              {text: 'Regresar', onPress: null, style: 'cancel'},
            ],
            {cancelable: false},
          );
    }

    async deleteRSVPForUser() {
        this.setState({isLoading: true})
        const currUser = Parse.User.current();
        let evento = this.state.eventoObject
        // Query
        const EventoRSVP = Parse.Object.extend("EventoRSVP");
        const query = new Parse.Query(EventoRSVP);
        query.equalTo("user", currUser);
        query.equalTo("evento", evento);
        const eventoRSVPObject = await query.first();
        if (eventoRSVPObject != null) {
            eventoRSVPObject.destroy()
            this.triggerCloudCode("delete")
            trackEvent("evento_rsvp_cancel", {
                escuela: currUser.get('escuela')?.id || "",
                eventoId: evento ? evento.id : ""
            });
            this.props.route.params.eventoObj.reloadNow()
            this.setState({isLoading: false, eventoRSVP: false})
        }
    }

    async saveRSVP() {
        const currUser = Parse.User.current();

        const estudianteId = await this.getEstudianteIdForUser()

        const EventoRSVP = Parse.Object.extend("EventoRSVP");
        const eventoRSVP = new EventoRSVP();

        eventoRSVP.set("evento", this.state.eventoObject);
        eventoRSVP.set("user", currUser);
        eventoRSVP.set("estudiante", estudianteId);

        let result = await eventoRSVP.save()
        if (result.id != null) {
            this.triggerCloudCode("save")
            trackEvent("evento_rsvp_confirm", {
                escuela: currUser.get('escuela')?.id || "",
                eventoId: this.state.eventoObject ? this.state.eventoObject.id : ""
            });
            this.props.route.params.eventoObj.reloadNow()
            this.setState({isLoading: false, eventoRSVP: true})
            this.presentFeedback("Evento Confirmado", "Tu asistencia al evento ha sido confirmada exitosamente. Una notificación ha sido enviada a la escuela.")
        } else {
            this.presentFeedback("Ocurrió algo inesperado", "Intenta de nuevo, por favor.")
        }
    }

    async triggerCloudCode(actionType) {
        const cloud = Parse.Cloud;
        const saveFuncName = "saveRSVP";
        const deleteFuncName = "deleteRSVP"
        
        const currUser = Parse.User.current();
        const evento = this.state.eventoObject
        const eventName = evento.get("nombre")
        const estudianteId = await this.getEstudianteIdForUser()
        const Estudiantes = Parse.Object.extend("Estudiantes");
        const query = new Parse.Query(Estudiantes);
        let estudianteObj = await query.get(estudianteId)

        const escuelaObjId = currUser.get("escuela").id
        const parentescoStr = currUser.get("parentesco")

        const alumnoStr = estudianteObj.get("NOMBRE") + " " + estudianteObj.get("ApPATERNO")

        var funcName = saveFuncName
        var messageStr = parentescoStr + " de " + alumnoStr + " ha confirmado su asistencia al evento " + eventName
        if (actionType == "delete") {
            funcName = deleteFuncName
            messageStr = parentescoStr + " de " + alumnoStr + " ha cancelado su asistencia al evento " + eventName
        }

        const params = { message: messageStr, escuelaObjId: escuelaObjId };
        cloud.run(funcName, params).then((result) => {
            console.log("Cloud result: " + JSON.stringify(result));
        }, (error) => {
            console.log("Cloud error: " + JSON.stringify(error));
        });
    }

    async getEstudianteIdForUser() {
        var estudianteId = ""
        const value = await AsyncStorage.getItem('userEstudianteIDs');
        if (value !== null && value.includes(',')) {
            let estudianteIDsArr = value.split(",");
            estudianteId = estudianteIDsArr[0]
        } else {
            estudianteId = value
        }
        console.log("getEstudianteIdForUser: " + estudianteId);
        return estudianteId
    }

    renderRSVPSection() {
        const { isPastEvent, isRSVPRequired, eventoRSVP, isLoading } = this.state;

        if (isPastEvent || !isRSVPRequired) return null;

        return (
            <View style={styles.rsvpCard}>
                <Text style={styles.rsvpCardTitle}>Confirmación de Asistencia</Text>
                
                {eventoRSVP ? (
                    <View style={styles.rsvpConfirmedContainer}>
                        <View style={styles.rsvpConfirmedBadge}>
                            <AntDesign name="checkcircle" size={20} color={Colors.mintDark} />
                            <Text style={styles.rsvpConfirmedText}>Asistencia Confirmada</Text>
                        </View>
                        <TouchableOpacity 
                            onPress={() => this.handleUnconfirmRSVP(this)}
                            style={styles.cancelButton}
                        >
                            <Text style={styles.cancelButtonText}>Cancelar asistencia</Text>
                        </TouchableOpacity>
                    </View>
                ) : (
                    <View style={styles.rsvpPendingContainer}>
                        {isLoading ? (
                            <ActivityIndicator size="large" color={Colors.grassDark} />
                        ) : (
                            <TouchableOpacity 
                                onPress={() => this.handleRSVPClick(this)}
                                style={styles.confirmButton}
                            >
                                <Text style={styles.confirmButtonText}>Confirmar Asistencia</Text>
                            </TouchableOpacity>
                        )}
                    </View>
                )}
            </View>
        );
    }

    render() {
        return (
            <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
                {/* Header */}
                <View style={styles.header}>
                    <TouchableOpacity 
                        onPress={this.backBtnPressed.bind(this)}
                        style={styles.backButton}
                        hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                    >
                        <Text style={styles.backBtnText}>← Atrás</Text>
                    </TouchableOpacity>

                    {this.state.hasAttachment && (
                        <TouchableOpacity 
                            onPress={this.openAttachmentBtnPressed.bind(this)}
                            style={styles.photosButton}
                        >
                            <Image
                                style={styles.attachmentIcon}
                                source={require('../assets/images/attachmentIconWhite.png')}
                            />
                            <Text style={styles.photosButtonText}>Ver fotos</Text>
                        </TouchableOpacity>
                    )}
                </View>

                <ScrollView 
                    style={styles.scrollView}
                    contentContainerStyle={styles.contentContainer}
                    showsVerticalScrollIndicator={false}
                >
                    {/* Main Card */}
                    <View style={styles.mainCard}>
                        {/* Event Title */}
                        <Text style={styles.eventTitle}>{this.state.eventoNombre}</Text>

                        {/* Date & Time Row */}
                        <View style={styles.dateTimeRow}>
                            <View style={styles.dateTimeItem}>
                                <Text style={styles.dateTimeLabel}>Fecha</Text>
                                <Text style={styles.dateTimeValue}>{this.state.eventoFecha}</Text>
                            </View>
                            <View style={styles.dateTimeDivider} />
                            <View style={styles.dateTimeItem}>
                                <Text style={styles.dateTimeLabel}>Hora</Text>
                                <Text style={styles.timeValue}>{this.state.eventoHora}</Text>
                            </View>
                        </View>

                        {/* Location & Audience */}
                        <View style={styles.infoSection}>
                            <View style={styles.infoRow}>
                                <View style={styles.infoItem}>
                                    <Text style={styles.infoLabel}>Lugar</Text>
                                    <Text style={styles.infoValue}>{this.state.eventoLugar}</Text>
                                </View>
                            </View>
                            <View style={styles.infoRow}>
                                <View style={styles.infoItem}>
                                    <Text style={styles.infoLabel}>Público</Text>
                                    <Text style={styles.infoValue}>{this.state.eventoPublico}</Text>
                                </View>
                            </View>
                        </View>

                        {/* Description */}
                        {this.state.eventoDescripcion && (
                            <View style={styles.descriptionSection}>
                                <Text style={styles.descriptionLabel}>Descripción</Text>
                                <Text style={styles.descriptionText}>{this.state.eventoDescripcion}</Text>
                            </View>
                        )}
                    </View>

                    {/* RSVP Section */}
                    {this.renderRSVPSection()}

                    <View style={styles.bottomSpacer} />
                </ScrollView>
            </SafeAreaView>
        )
    }
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1, 
        backgroundColor: Colors.grassDark,
    },
    header: {
        flexDirection: 'row',
        justifyContent: 'space-between',
        alignItems: 'center',
        paddingHorizontal: 16,
        paddingVertical: 12,
        backgroundColor: Colors.grassDark,
    },
    backButton: {
        paddingVertical: 4,
    },
    backBtnText: {
        color: 'white',
        fontWeight: '600',
        fontSize: 16,
    },
    photosButton: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: 'white',
        paddingHorizontal: 14,
        paddingVertical: 8,
        borderRadius: 20,
    },
    attachmentIcon: {
        height: 16,
        width: 16,
        marginRight: 6,
        tintColor: Colors.grassDark,
    },
    photosButtonText: {
        color: Colors.grassDark,
        fontWeight: '700',
        fontSize: 14,
    },
    scrollView: {
        flex: 1,
    },
    contentContainer: {
        paddingHorizontal: 16,
        paddingTop: 8,
    },

    // Main Card
    mainCard: {
        backgroundColor: 'white',
        borderRadius: 20,
        padding: 24,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 6,
    },
    eventTitle: {
        color: Colors.darkGrayDark,
        fontSize: 26,
        fontWeight: '800',
        marginBottom: 24,
        lineHeight: 32,
    },

    // Date & Time
    dateTimeRow: {
        flexDirection: 'row',
        backgroundColor: Colors.grassLight + '30',
        borderRadius: 12,
        padding: 16,
        marginBottom: 24,
    },
    dateTimeItem: {
        flex: 1,
        alignItems: 'center',
    },
    dateTimeDivider: {
        width: 1,
        backgroundColor: Colors.grassDark + '30',
        marginHorizontal: 12,
    },
    dateTimeLabel: {
        color: Colors.darkGrayLight,
        fontSize: 11,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 6,
    },
    dateTimeValue: {
        color: Colors.darkGrayDark,
        fontSize: 15,
        fontWeight: '600',
        textAlign: 'center',
        textTransform: 'capitalize',
    },
    timeValue: {
        color: Colors.grassDark,
        fontSize: 24,
        fontWeight: '800',
    },

    // Info Section
    infoSection: {
        marginBottom: 24,
    },
    infoRow: {
        marginBottom: 16,
    },
    infoItem: {
        flex: 1,
    },
    infoLabel: {
        color: Colors.darkGrayLight,
        fontSize: 11,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 6,
    },
    infoValue: {
        color: Colors.darkGrayDark,
        fontSize: 16,
        fontWeight: '500',
        lineHeight: 22,
    },

    // Description
    descriptionSection: {
        borderTopWidth: 1,
        borderTopColor: '#f0f0f0',
        paddingTop: 20,
    },
    descriptionLabel: {
        color: Colors.darkGrayLight,
        fontSize: 11,
        fontWeight: '700',
        textTransform: 'uppercase',
        letterSpacing: 0.5,
        marginBottom: 10,
    },
    descriptionText: {
        color: Colors.darkGrayDark,
        fontSize: 16,
        fontWeight: '400',
        lineHeight: 24,
    },

    // RSVP Card
    rsvpCard: {
        backgroundColor: 'white',
        borderRadius: 20,
        padding: 24,
        marginTop: 16,
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.15,
        shadowRadius: 12,
        elevation: 6,
    },
    rsvpCardTitle: {
        color: Colors.darkGrayDark,
        fontSize: 16,
        fontWeight: '700',
        marginBottom: 16,
        textAlign: 'center',
    },
    rsvpConfirmedContainer: {
        alignItems: 'center',
    },
    rsvpConfirmedBadge: {
        flexDirection: 'row',
        alignItems: 'center',
        backgroundColor: Colors.mintLight + '30',
        paddingHorizontal: 20,
        paddingVertical: 12,
        borderRadius: 12,
        marginBottom: 16,
    },
    rsvpConfirmedText: {
        color: Colors.mintDark,
        fontSize: 16,
        fontWeight: '700',
        marginLeft: 10,
    },
    cancelButton: {
        paddingVertical: 8,
    },
    cancelButtonText: {
        color: Colors.grapefruitDark,
        fontSize: 14,
        fontWeight: '600',
    },
    rsvpPendingContainer: {
        alignItems: 'center',
    },
    confirmButton: {
        backgroundColor: Colors.grassDark,
        paddingHorizontal: 32,
        paddingVertical: 16,
        borderRadius: 12,
        shadowColor: Colors.grassDark,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 4,
    },
    confirmButtonText: {
        color: 'white',
        fontSize: 18,
        fontWeight: '700',
    },

    bottomSpacer: {
        height: 32,
    },
});
