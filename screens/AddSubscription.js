import React from 'react';
import { trackEvent } from "@aptabase/react-native";
var Parse = require('parse/react-native');
import AddSubscriptionView from '../components/AddSubscriptionView';
const STRIPE_ERROR = 'Error en el sistema de pagos. Intenta de nuevo, por favor.';
const SERVER_ERROR = 'Verifica tu método de pago e intenta de nuevo, por favor.';
import NetworkState from '../components/Network.js';
import Constants from '../constants/Constants';
const STRIPE_PUBLISHABLE_KEY = Constants.STRIPE_PUBLISHABLE_KEY;
/**
 * The method sends HTTP requests to the Stripe API.
 * It's necessary to manually send the payment data
 * to Stripe because using Stripe Elements in React 
 * Native apps isn't possible.
 *
 * @param creditCardData the credit card data
 * @return Promise with the Stripe data
 */
const getCreditCardToken = (creditCardData) => {
  const card = {
    'card[number]': creditCardData.values.number.replace(/ /g, ''),
    'card[exp_month]': creditCardData.values.expiry.split('/')[0],
    'card[exp_year]': creditCardData.values.expiry.split('/')[1],
    'card[cvc]': creditCardData.values.cvc
  };
  return fetch('https://api.stripe.com/v1/tokens', {
    headers: {
      // Use the correct MIME type for your server
      Accept: 'application/json',
      // Use the correct Content Type to send data to Stripe
      'Content-Type': 'application/x-www-form-urlencoded',
      // Use the Stripe publishable key as Bearer
      Authorization: `Bearer ${STRIPE_PUBLISHABLE_KEY}`
    },
    // Use a proper HTTP method
    method: 'post',
    // Format the credit card data to a string of key-value pairs
    // divided by &
    body: Object.keys(card)
      .map(key => key + '=' + card[key])
      .join('&')
  }).then(response => response.json());
};

/**
 * The main class that submits the credit card data and
 * handles the response from Stripe.
 */
export default class AddSubscription extends React.Component {
  static navigationOptions = {
    header: null,
  };

  constructor(props) {
    super(props);

    const navParams = props.route.params;
    const stripeConnectAccntId = navParams.stripeConnectAccntId;
    const pagoCantidad = navParams.pagoCantidad;
    const stripeCommissionPercent = navParams.stripeCommissionPercent;
    const pagoConComision = pagoCantidad * stripeCommissionPercent; // Fetch from server
    const pagoConComisionDouble = pagoConComision.toFixed(2);
    const pagoObjId = navParams.pagoObjId;
    const pagoConcepto = navParams.pagoConcepto;
    
    this.state = {
      submitted: false,
      error: null,
      stripeCommissionPercent: stripeCommissionPercent,
      pagoCantidad: pagoCantidad,
      pagoCantidadComision: pagoConComisionDouble,
      pagoObjId: pagoObjId,
      pagoConcepto: pagoConcepto,
      escuelaId: "",
      currentUserId: "",
      userEmailAddress: "",
      currentUser: null,
      stripeConnectAccntId: stripeConnectAccntId,
    }
  }

  UNSAFE_componentWillMount() {
    this.getCurrentUser();
  }

  getCurrentUser() {
    Parse.User.currentAsync().then(function(user) {
        // do stuff with your user
        let escuela = user.get('escuela');
        var userEmailAddress = user.get("emailAddrs");
        if (!NetworkState.validateEmail(userEmailAddress)) {
          userEmailAddress = "INVALID";
        }
        this.setState({escuelaId: escuela.id, currentUserId: user.id, userEmailAddress: userEmailAddress, currentUser: user});
    }.bind(this));
  }

  backBtnPressed() {
    this.props.navigation.goBack();
  }

  // Handles submitting the payment request
  onSubmit = async (creditCardInput, userEmail) => {
    console.log("**onSubmitCardCharge");
    if (userEmail.length > 0) {
      this.processUserEmail(userEmail);
    }
    // Disable the Submit button after the request is sent
    this.setState({ submitted: true });
    let creditCardToken;
    try {
      // Create a credit card token
      creditCardToken = await getCreditCardToken(creditCardInput);
      if (creditCardToken.error) {
        // Reset the state if Stripe responds with an error
        // Set submitted to false to let the user subscribe again
        this.setState({ submitted: false, error: STRIPE_ERROR });
        return;
      }
      
    } catch (e) {
      console.log("Catch: " + JSON.stringify(e));
      // Reset the state if the request was sent with an error
      // Set submitted to false to let the user subscribe again
      this.setState({ submitted: false, error: STRIPE_ERROR });
      return;
    }
    // Call Cloud Code to make Stripe charge
    this.runCloudCodeFunction(creditCardToken.id);
  };

  processUserEmail(userEmail) {
    if (userEmail.length > 0 && NetworkState.validateEmail(userEmail)) {
      let currentUser = this.state.currentUser;
      currentUser.set("emailAddrs", userEmail);
      currentUser.save().then((updatedUser) => {
        console.log("User emailAddrs updated: " + updatedUser.id);
      })
    } else { 
      console.log("userEmail NOT valid"); 
    }
  }

  runCloudCodeFunction(stripeSource) {
    // Calculate Application Fee
    let applicationFeeAmount = this.calculateApplicationFeeForCharge();
    // Cloud
    const cloud = Parse.Cloud;
    const funcName = "createStripeCharge";
    let metadataObj = {escuelaId: this.state.escuelaId, pagoObjId: this.state.pagoObjId, userId: this.state.currentUserId, stripeCommissionPercent: this.state.stripeCommissionPercent}
    const params = { stripeConnectAccntId: this.state.stripeConnectAccntId, stripeSource: stripeSource, pagoConcepto: this.state.pagoConcepto, pagoAmount: this.state.pagoCantidadComision, applicationFeeAmount: applicationFeeAmount, metadata: metadataObj};
    cloud.run(funcName, params).then((result) => {
        let successStr = result.substring(0, 10);
        if (successStr == "SUCCESS_ch") {
          // FINAL SUCCESS
          trackEvent("subscription_add", {
            escuela: this.state.escuelaId,
            success: true
          });
          this.setState({ submitted: false, error: null }, () => {
            // stripePagoSuccess
            props.route.params.stripePagoSuccess();
            this.props.navigation.goBack();
          });
        } else {
          this.setState({ submitted: false, error: SERVER_ERROR });
        }
    }, (error) => {
        console.log("Stripe Cloud error: " + JSON.stringify(error));
        this.setState({ submitted: false, error: SERVER_ERROR });
    });
}

  calculateApplicationFeeForCharge() {
    // Calculate Application Fee
    let originalPagoAmount = this.state.pagoCantidad;
    let pagoAmountComision = this.state.pagoCantidadComision;
    let stripeCommission = 3 + (pagoAmountComision * 0.036);
    let remainingCharge = pagoAmountComision - stripeCommission;
    let applicationFeeAmount =  remainingCharge - originalPagoAmount;
    if (applicationFeeAmount < 1) {
      applicationFeeAmount = 1;
    }
    console.log("applicationFeeAmount: " + applicationFeeAmount);
    return applicationFeeAmount;
  }
  
  // render the subscription view component and pass the props to it
  render() {
    const { submitted, error, pagoCantidad, stripeCommissionPercent, userEmailAddress } = this.state;
    return (
        <AddSubscriptionView
          error={error}
          submitted={submitted}
          onSubmit={this.onSubmit}
          backBtnPressed={this.backBtnPressed.bind(this)}
          pagoCantidad={pagoCantidad}
          stripeCommissionPercent={stripeCommissionPercent}
          userEmailAddress={userEmailAddress}
        />
    );
  }
}