import React from 'react';
import { trackEvent } from "@aptabase/react-native";
var Parse = require('parse/react-native');
import Colors from '../constants/Colors';
import dayjs from '../utils/dayjs';
import {
  Image,
  SafeAreaView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableHighlight,
  ActivityIndicator,
  TouchableOpacity,
  FlatList,
  View,
  Dimensions,
  Alert,
} from 'react-native';
//const screenWidth = Dimensions.get('window').width;

export default class ServiciosHistorial extends React.Component {
    
    currentUser = new Parse.User();
    

    static navigationOptions = {
        header: null,
      };

    constructor(props) {
        super(props);
        // Initial State
        this.state = { 
                       isLoading: true,
                       data: [],
                       saldoPendiente: 0.0,
                       hasData: true
                     };
    }

    UNSAFE_componentWillMount() {
      this.getCurrentUser();
    }

    getCurrentUser() {
        Parse.User.currentAsync().then(function(user) {
            // do stuff with your user
            this.currentUser = user;
            var escuela = user.get('escuela');
            this.retrieveServiciosHistorial(escuela);
        }.bind(this));
    }

    retrieveServiciosHistorial(escuela) {
        // Estudiantes Query
        var Estudiantes = Parse.Object.extend("Estudiantes");
        var queryEstudiantes = new Parse.Query(Estudiantes);
        queryEstudiantes.equalTo("PersonasAutorizadas", this.currentUser);
        // Query
        var Servicio = Parse.Object.extend("Servicio");
        var queryServiciosEscuela = new Parse.Query(Servicio);
        queryServiciosEscuela.equalTo("escuela", escuela);

        var ServicioSolicitado = Parse.Object.extend("ServicioSolicitado");
        var query = new Parse.Query(ServicioSolicitado)
        query.matchesQuery("servicio", queryServiciosEscuela);
        query.matchesQuery("estudiante", queryEstudiantes);
        query.limit(60);
        query.include('servicio');
        query.include('estudiante');
        query.include('personaAutorizada');
        query.descending("updatedAt");
        query.find()
        .then((servicioSolicitados) => {
            if (servicioSolicitados.length == 0) {
                this.setState({hasData: false, isLoading: false});
                return;
            }
            // The object was retrieved successfully.
            //console.log("ServicioSolicitado count: " + servicioSolicitados.length);
            this.processFetchedData(servicioSolicitados);
        }, (error) => {
            this.setState({isLoading: false});
            this.presentFeedback("Algo salió mal", "No fue posible traer la información de accesos. Intenta de nuevo, por favor.");
        });
    }

    processFetchedData(servicioSolicitados) {
        var dataArr = [];
        var saldoPendienteCount = 0.0;
        for (var i = 0; i < servicioSolicitados.length; i++) {
            var object = servicioSolicitados[i];

            let estudianteObj = object.get('estudiante');
            let servicioObj = object.get('servicio');
            var servicioStatus = "";
            let status = object.get('status');
            switch (status) {
                case 0:
                    servicioStatus = "Solicitado";
                    break;
                case 1:
                    servicioStatus = "En Progreso";
                    break;
                case 2:
                    // Completado
                    servicioStatus = "Por pagar";
                    saldoPendienteCount = saldoPendienteCount + servicioObj.get('precio');
                    break;
                case 3:
                    // Pagado
                    servicioStatus = "Pagado";
                    break;
                case 8:
                    // Rechazado
                    servicioStatus = "Rechazado por la Escuela";
                    break;
                case 9:
                    // Cancelado
                    servicioStatus = "Cancelado por el Papá";
                    break;
            }
            let servicioNombreString = servicioObj.get('nombre');
            let estudianteNombreString = estudianteObj.get('NOMBRE') + " " + estudianteObj.get('APELLIDO');
            let fechaSolicitudString = dayjs(object.get('fechaSolicitud')).format('dddd DD/MMM | HH:mm');
            var comentariosString = "";
            if (object.get('comentarios') != null) {
                comentariosString = object.get('comentarios');
            }

            let data = {
                servicioNombre: servicioNombreString,
                estudiante: estudianteNombreString,
                fechaSolicitud: fechaSolicitudString,
                comentarios: comentariosString,
                status: servicioStatus,
            }
            dataArr.push(data);
        }
        this.setState({ data: dataArr, isLoading: false, saldoPendiente: saldoPendienteCount });
    }

    _didSelectItem(item) {
        this.props.navigation.navigate("EventoDetail", {eventoObj: item});
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



    render() {
        return (
            <SafeAreaView style={styles.safeArea}>
                <View style={styles.header}>
                    <TouchableOpacity onPress={this.backBtnPressed.bind(this)}>
                        <Text style={styles.backBtnText}>{"< Atrás"}</Text>
                    </TouchableOpacity>
                    <View style={styles.dividerView}></View>
                    <View style={styles.container}>
                        <View style={{alignItems: 'center'}}>
                            <Text style={styles.titleText}>Historial de Servicios</Text>
                        </View>

                    <View style={styles.adeudoView}>
                        <Text style={styles.adeudoText}>{"Saldo pendiente: $" + this.state.saldoPendiente}</Text>
                    </View>

                        <ScrollView contentContainerStyle={styles.contentContainer}>
                            {
                                this.state.isLoading && (
                                    <ActivityIndicator size="large" color="#ffff" animating={this.state.isLoading} style={{margin: 8}} hidesWhenStopped={true}/>
                                )
                            }
                            {
                                this.state.hasData ? (
                                    <FlatList
                                    data={this.state.data}
                                    style={{backgroundColor: Colors.pinkroseDark}}
                                    renderItem={({item}) => 
                                        <View style={styles.listCard}>
                                            <View style={{flexDirection: 'row', justifyContent: 'space-between'}}>
                                                <Text style={styles.cardText}>{"Servicio: " + item.servicioNombre}</Text>
                                                <Text style={{
                                                    color: item.status == 'Por pagar' ? Colors.bittersweetLight : Colors.darkGrayDark,
                                                    fontWeight: '500',
                                                    marginBottom: 6
                                                }}>{item.status}</Text>
                                            </View>
                                            <Text style={styles.cardText}>{item.estudiante}</Text>
                                            <Text style={styles.cardText}>{item.fechaSolicitud}</Text>
                                            <Text style={styles.cardText}>{"Comentarios: " + item.comentarios}</Text>
                                        </View>
                                    }

                                    keyExtractor={(item, index) => index.toString()}
                                    />

                                    ) : (
                                        <View style={styles.emptyStateView}>
                                            <Text style={styles.emptyStateText}>Aquí va a aparecer el historial de servicios que has solicitado a la Escuela. Por ahora no hay servicios solicitados.</Text>
                                            <Image source={require('../assets/images/kido.png')} style={styles.emptyStateLogoImg} />
                                        </View>
                                    )
                            }
                        </ScrollView>
                    </View>
                </View>
            </SafeAreaView>
        )
    }
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1, 
        backgroundColor: Colors.pinkroseDark
    },
    header: {
        flex: 1,
        backgroundColor: Colors.pinkroseDark,
        paddingTop: Platform.OS === 'ios' ? 8 : 28,
        paddingLeft: 8,
        paddingRight: 8
    },
    dividerView: {
        height: 2,
        backgroundColor: Colors.pinkroseLight,
        marginTop: 4
    },
    subtitleText: {
        color: 'white',
        fontSize: 17,
        fontWeight: '500',
        marginBottom: 8
    },
    listCard: {
        backgroundColor: 'white',
        padding: 8,
        borderRadius: 8,
        marginBottom: 8
    },
    backBtnText: {
        color: Colors.actionColor,
        fontWeight: '700'
    },
    container: {
      flex: 1,
      paddingTop: 8,
      backgroundColor: Colors.pinkroseDark,
    },
    contentContainer: {
        backgroundColor: Colors.pinkroseDark,
    },
    adeudoView: {
        backgroundColor: Colors.pinkroseLight, 
        flexDirection: 'row', 
        marginBottom: 10,
        justifyContent: 'center',
        alignItems: 'center',
        borderRadius: 8,
        padding: 4
    },
    adeudoText: {
        color: 'white', 
        fontSize: 18, 
        fontWeight: '600'
    },
    titleText: {
        color: 'white',
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 8
    },
    cardText: {
        color: Colors.darkGrayDark,
        fontWeight: '500',
        marginBottom: 6
    },
    emptyStateText: {
        color: 'white',
        fontWeight: '700'
    },
    emptyStateLogoImg: {
        height: 80,
        resizeMode: 'contain',
        marginTop: 40
    },
    emptyStateView: {
        flex: 1,
        justifyContent: 'center',
        alignItems: 'center',
        padding: 16
    }
});