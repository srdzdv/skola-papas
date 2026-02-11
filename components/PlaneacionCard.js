import React from "react"
import { ViewStyle, View, TextInput, Text } from "react-native"
import Colors from '../constants/Colors';


const PlaneacionCard = ({ actNumber, titulo, tema, habitos, valores, descripcion, notas }) => {


  return (
    <View style={$card}>
        <Text style={$actividadTitle}>{actNumber}</Text>

        <Text style={$inputLabel}>Título</Text>
        <TextInput 
          style={$inputField} 
          value={titulo}
        />

        <Text style={$inputLabel}>Tema</Text>
        <TextInput 
          style={$inputField} 
          value={tema}
        />

        <Text style={$inputLabel}>Hábitos</Text>
        <TextInput 
          style={$inputField} 
          value={habitos}
        />

        <Text style={$inputLabel}>Valores</Text>
        <TextInput 
          style={$inputField} 
          value={valores}
        />

        <Text style={$inputLabel}>Descripción de actividades</Text>
        <TextInput 
          style={$inputFieldMultiline}
          multiline={true}
          numberOfLines={4} 
          value={descripcion}
        />

        <Text style={$inputLabel}>Notas</Text>
        <TextInput 
          style={$inputFieldMultiline} 
          multiline={true} 
          numberOfLines={3}
          value={notas}
        />

    </View>
  )
}

export default PlaneacionCard

const $card: ViewStyle = {
    height: 508, 
    marginTop: 8, 
    backgroundColor: Colors.sunflowerLight, 
    borderRadius: 12,
    marginBottom: 8,
    padding: 12
  }

const $actividadTitle: ViewStyle = {
    alignSelf: 'center', 
    color: Colors.darkGrayDark, 
    fontSize: 20, 
    fontWeight: "bold"
}

  const $inputLabel: ViewStyle = {
    marginTop: 6,
    color: Colors.darkGrayDark, 
  }

  const $inputField: ViewStyle = {
    height: 36,
    borderColor: Colors.neutral300,
    borderWidth: 1,
    paddingLeft: 8,
    margin: 4,
    borderRadius: 10,
    backgroundColor: Colors.neutral100
  };

  const $inputFieldMultiline: ViewStyle = {
    height: 66,
    borderColor: Colors.neutral300,
    borderWidth: 1,
    paddingLeft: 8,
    margin: 4,
    borderRadius: 10,
    backgroundColor: Colors.neutral100
  };