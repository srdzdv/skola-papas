import React from 'react';
import { StyleSheet, Text, View, ScrollView, Platform, SafeAreaView, TouchableOpacity, ActivityIndicator } from 'react-native';
import KeyboardSpacer from 'react-native-keyboard-spacer';
import PaymentFormView from './PaymentFormView';
import Colors from '../constants/Colors';
/**
 * The class renders a view with PaymentFormView
 */
export default class AddSubscriptionView extends React.Component {

  constructor(props) {
    super(props);
    // props
    const pagoCantidadProps = this.props.pagoCantidad;
    const stripeCommissionPercent = this.props.stripeCommissionPercent;
    const pagoConComision = pagoCantidadProps * stripeCommissionPercent; // Fetch from server
    const pagoConComisionDouble = pagoConComision.toFixed(2);
    const stripeCommissionPercentString = (stripeCommissionPercent * 100) -100;
    const commissionString = stripeCommissionPercentString.toFixed(1) + "% de comisión."
    const userEmailAddress = this.props.userEmailAddress;
    // Initial State
    this.state = { 
      data: [],
      pagoCantidad: pagoCantidadProps,
      pagoConComision: pagoConComisionDouble,
      isLoading: false,
      commissionString: commissionString,
      userEmailAddress: userEmailAddress
    }
  }

  backBtnPressed() {
    this.props.backBtnPressed();
  }

  render() {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.container}>
          
          <View style={styles.topRowView}>
              <TouchableOpacity onPress={this.backBtnPressed.bind(this)}>
                  <Text style={styles.headerBtnText}>{"< Atrás"}</Text>
              </TouchableOpacity>
              <ActivityIndicator size="small" color="#ffff" animating={this.props.submitted} style={{marginRight: 4}} hidesWhenStopped={true}/>
          </View>

          <ScrollView style={styles.container} ref={ref => (this.scrollViewRef = ref)}>
            <View style={styles.textWrapper}>
              <Text style={styles.titleText}>
                Skola Pagos
              </Text>
            </View>
            <Text style={styles.smallText}>{"Monto: $" + this.state.pagoCantidad}</Text>
            <View style={styles.textWrapper}>
              <Text style={styles.smallText}>{this.state.commissionString}</Text>
            </View>
            <View style={styles.textWrapper}>
              <Text style={styles.infoText}>
                {"Total: $" + this.state.pagoConComision}
              </Text>
            </View>
            <View style={styles.cardFormWrapper}>
              <PaymentFormView {...this.props}/>
            </View>
          </ScrollView>
          {/* Scrolls to the payment form */}
          <KeyboardSpacer
            onToggle={() => { setTimeout(() => this.scrollViewRef.scrollToEnd({ animated: true }),0)} }
          />
        </View>
      </SafeAreaView>
    );
  }
}
const styles = StyleSheet.create({
  safeArea: {
    flex: 1, 
    backgroundColor: Colors.aquaLight
  },
  container: {
    flex: 1,
    backgroundColor: 'white'
  },
  topRowView: {
    paddingLeft: 8,
    paddingRight: 8,
    paddingTop: Platform.OS === 'ios' ? 8 : 28,
    paddingBottom: 4,
    flexDirection: 'row', 
    justifyContent: 'space-between',
    backgroundColor: Colors.aquaLight
  },
  headerBtnText: {
    color: Colors.actionColor,
    fontWeight: '600'
  },
  textWrapper: {
    margin: 10
  },
  infoText: {
    fontSize: 18,
    textAlign: 'center'
  },
  smallText: {
    fontSize: 15,
    textAlign: 'center'
  },
  titleText: {
    fontSize: 22,
    fontWeight: "500",
    textAlign: 'center'
  },
  cardFormWrapper: {
    padding: 10,
    margin: 10
  },
});