import React from 'react';
var Parse = require('parse/react-native');
import { StyleSheet, Text, View, Button, TextInput } from 'react-native';
import { CreditCardInput } from 'react-native-credit-card-input';
import { FontAwesome } from '@expo/vector-icons';
import Colors from '../constants/Colors';
import NetworkState from '../components/Network.js';
/**
 * Renders the payment form and handles the credit card data
 * using the CreditCardInput component.
 */
export default class PaymentFormView extends React.Component {
  constructor(props) {
    super(props);
    let userEmailProp = this.props.userEmailAddress;
    this.state = { cardData: { valid: false },
                   userEmail: userEmailProp,
                   newUserEmail: "",
                  };
  }

  render() {
    const { onSubmit, submitted, error } = this.props;
    return (
      <View>
        <View>
          <CreditCardInput requiresName 
                           labels={{number: "Número de tarjeta", expiry: "Exp", cvc: "CVC", name: "Nombre del titular"}}  
                           placeholder={{ number: "1234 5678 1234 5678", expiry: "MM/YY", cvc: "CVC", name: "" }}
                           onChange={(cardData) => this.setState({ cardData })} />
        </View>
        {
          this.state.userEmail == "INVALID" && (
            <View style={styles.captureEmailWrapper}>
              <Text style={styles.captureEmailText}>Ingresa email para envío de comprobante:</Text>
              <TextInput style={styles.whiteTextField} onChangeText={(text) => this.setState({newUserEmail: text})} placeholder={"Ingresar email"} keyboardType={'email-address'} autoCapitalize={'none'}/>
            </View>
          )
        }
        <View style={styles.buttonWrapper}>
          <Button
            title='Pagar'
            disabled={!this.state.cardData.valid || submitted}
            onPress={() => onSubmit(this.state.cardData, this.state.newUserEmail)}
          />
          {/* Show errors */}
          {error && (
            <View style={styles.alertWrapper}>
              <View style={styles.alertIconWrapper}>
                <FontAwesome name="exclamation-circle" size={20} style={{ color: '#c22' }} />
              </View>
              <View style={styles.alertTextWrapper}>
                <Text style={styles.alertText}>{error}</Text>
              </View>
            </View>
          )}
        </View>
      </View>
    );
  }
}
const styles = StyleSheet.create({
  container: {
    flex: 1,
    alignItems: 'center'
  },
  buttonWrapper: {
    padding: 10,
    zIndex: 100
  },
  alertTextWrapper: {
    flex: 20,
    justifyContent: 'center',
    alignItems: 'center'
  },
  captureEmailWrapper: {
    padding: 10,
    zIndex: 100,
    marginTop: 24,
  },
  captureEmailText: {
    textAlign: 'center',
    fontWeight: '500'
  },
  alertIconWrapper: {
    padding: 5,
    flex: 4,
    justifyContent: 'center',
    alignItems: 'center'
  },
  alertText: {
    color: '#c22',
    fontSize: 16,
    fontWeight: '400'
  },
  alertWrapper: {
    backgroundColor: '#ecb7b7',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexDirection: 'row',
    flexWrap: 'wrap',
    borderRadius: 5,
    paddingVertical: 5,
    marginTop: 10
  },
  whiteTextField: {
    marginBottom: 12,
    backgroundColor: '#fff',
    paddingLeft: 4,
    height: 34,
    color: Colors.darkGrayDark,
    width: '100%',
    textAlign: 'center',
    borderBottomColor: Colors.darkGrayDark,
    borderBottomWidth: 1
  },
});