import React from 'react';
import ParseInit from '../ParseInit.js';
var Parse = require('parse/react-native');
import Colors from '../constants/Colors';
import * as Notifications from 'expo-notifications'
import NetworkState from '../components/Network.js';
import Constants from '../constants/Constants';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { AuthContext } from '../context/AuthContext';

import MainTabNavigator from './MainTabNavigator';
import AuthStackNavigator from './AuthStackNavigation';

import {
  ActivityIndicator,
  StatusBar,
  Alert,
  Image,
  Platform,
  Text,
  View,
} from 'react-native';

const Stack = createNativeStackNavigator();

export default class AuthLoadingScreen extends React.Component {
  static contextType = AuthContext;

  constructor(props) {
    super(props);
    this.state = {
      isLoading: true,
      userToken: false
    }
  }

  componentDidMount() {
    this._bootstrapAsync();
  }

  // Fetch the token from storage then navigate to our appropriate place
  _bootstrapAsync = async () => {
    // Use AuthContext bootstrap
    const { bootstrap } = this.context;

    try {
      const result = await bootstrap();

      if (result.authenticated) {
        this.setState({ isLoading: false, userToken: true });
      } else {
        this.setState({ isLoading: false, userToken: false });
      }
    } catch (error) {
      console.log("ERROR during bootstrap: " + JSON.stringify(error));
      this.setState({ isLoading: false });
    }
  };

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

  // Render any loading content that you like here
  render() {
    if (this.state.isLoading) {
      return (
        <View style={{flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: Colors.bluejeansDark}}>
          <StatusBar barStyle="default" />
          {
            this.state.isLoading && (
              <ActivityIndicator size="large" color="#ffff" style={{marginTop: 40}}/>
            )
          }
          <Text style={{color: 'white', fontWeight: '600', marginTop: 24, marginLeft: 16}}>Inicializando Skola App...</Text>
          <Text style={{color: 'white', fontWeight: '400', marginTop: 24, marginLeft: 16}}>Versión 2.1.3</Text>
        </View>
      );
    }

    return (
        <Stack.Navigator screenOptions={{
          headerShown: false
        }}>
          {this.state.userToken == false ? (
            <Stack.Screen name="Auth" component={AuthStackNavigator} />
          ) : (
            <Stack.Screen name="Home" component={MainTabNavigator} />
          )}
        </Stack.Navigator>
    );
  }
}