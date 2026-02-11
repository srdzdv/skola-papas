import React from 'react';
import { trackEvent } from "@aptabase/react-native";
var Parse = require('parse/react-native');
import PlaneacionCard from '../components/PlaneacionCard';
import Colors from '../constants/Colors';
import dayjs from '../utils/dayjs';
import {
  SafeAreaView,
  Platform,
  StyleSheet,
  ScrollView,
  Text,
  TouchableOpacity,
  View,
  Dimensions,
  Alert,
} from 'react-native';
const screenWidth = Dimensions.get('window').width;

export default class PlaneacionDetail extends React.Component {
    currentUser = new Parse.User();
    
    static navigationOptions = {
        header: null,
      };

    constructor(props) {
        super(props);
        // CurrentEstudiante
        const planeacionObj = props.route.params.planeacionObj;
        const grupoString = props.route.params.grupo;
        const fechaString = planeacionObj.date
        // Initial State
        this.state = { 
            isLoading: false,
            planTitulo: planeacionObj.titulo,
            grupo: grupoString,
            descripcionTextInputHeight: 110,
            activities: planeacionObj.planObjects,
            planFecha: fechaString,
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

    expandTextInputForAndroid() {
        var currentTextInputHeight = this.state.descripcionTextInputHeight;
        let newTextInputHeight = currentTextInputHeight + 40;
        this.setState({descripcionTextInputHeight: newTextInputHeight });
    }





    render() {
        return (
            <SafeAreaView style={styles.safeArea}>
                <View style={styles.containerTop}>

                    <View style={{flexDirection: 'row', justifyContent: "space-between", alignItems: 'center'}}>
                        <TouchableOpacity onPress={this.backBtnPressed.bind(this)}>
                            <Text style={styles.backBtnText}>{"< Atrás"}</Text>
                        </TouchableOpacity>
                        <Text style={styles.titleText}>{this.state.planFecha}</Text>
                        <Text style={styles.subtitleText}>{this.state.grupo}</Text>
                    </View>

                    <View style={styles.dividerView}></View>

                    <View style={styles.container}>
                        {this.state.isLoading ?
                            <>
                                <Text style={styles.subtitleText}>{this.state.planFecha}</Text>
                            </>
                        :
                        <ScrollView>
                            {this.state.activities.map((activity, index) => (
                                <PlaneacionCard 
                                    key={activity.id} 
                                    actNumber={activity.key}
                                    titulo={activity.titulo}
                                    tema={activity.tema}
                                    habitos={activity.habitos}
                                    valores={activity.valores}
                                    descripcion={activity.descripcion}
                                    notas={activity.notas}
                                />
                            ))}
                        </ScrollView>
                        }
                    </View>



                </View>
            </SafeAreaView>
        )
    }
}

const styles = StyleSheet.create({
    safeArea: {
        flex: 1, 
        backgroundColor: Colors.sunflowerClear
    },
    containerTop: {
        flex: 1,
        backgroundColor: Colors.sunflowerClear,
        paddingTop: Platform.OS === 'ios' ? 8 : 28,
        paddingLeft: 8,
        paddingRight: 8
    },
    dividerView: {
        height: 2,
        backgroundColor: Colors.sunflowerLight,
        marginTop: 4
    },
    subtitleText: {
        color: Colors.darkGrayDark, 
        fontSize: 17,
        fontWeight: '500',
        marginBottom: 8
    },
    backBtnText: {
        color: Colors.lavanderDark,
        fontWeight: '700'
    },
    container: {
      flex: 1,
      paddingTop: 8,
      backgroundColor: Colors.sunflowerClear,
    },
    contentContainer: {
        backgroundColor: Colors.sunflowerDark,
    },
    titleText: {
        color: Colors.darkGrayDark, 
        fontSize: 20,
        fontWeight: 'bold',
        marginBottom: 4,
        marginLeft: 26
    },
    textInputShort: {
        height: 30,
        marginTop: 8,
        width: screenWidth - 16, 
        backgroundColor: 'white',
        paddingLeft: 8,
        marginBottom: 16,
        borderRadius: 5,
        fontSize: 16,
    },
    labelText: {
        color: Colors.darkGrayDark, 
        fontWeight: '700'
    },
    textInputTall: {
        height: 110,
        marginTop: 8,
        width: screenWidth - 16, 
        backgroundColor: 'white',
        padding: 8,
        marginBottom: 16,
        borderRadius: 5,
        fontSize: 16,
        textAlignVertical: 'top'
    },
});