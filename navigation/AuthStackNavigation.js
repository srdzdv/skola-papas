import React from 'react';
import { BackHandler } from 'react-native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import MainTabNavigator from './MainTabNavigator';

import LoginScreen from '../screens/LoginScreen';
import ScanLoginScreen from '../screens/ScanLoginScreen';

const Stack = createNativeStackNavigator();


function App() {
  // Disable Android back button
  BackHandler.addEventListener('hardwareBackPress', function() {
    return true;
  });

  return (
      <Stack.Navigator screenOptions={{
        headerShown: false
      }}>
        <Stack.Screen
          name="Login"
          component={LoginScreen}
          options={{ headerShown: false }}
        />
        <Stack.Screen name="ScanLogin" component={ScanLoginScreen} />
        <Stack.Screen name="Home" component={MainTabNavigator} />
      </Stack.Navigator>
  );
}

export default App;