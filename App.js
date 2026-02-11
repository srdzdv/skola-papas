import React, { useEffect } from 'react';
import { init } from "@aptabase/react-native";
var Parse = require('parse/react-native');
import { StyleSheet } from 'react-native';
import AppNavigator from './navigation/AppNavigator';
import { navigationRef } from './navigation/RootNavigation';
import AuthStackNavigator from './navigation/AuthStackNavigation';
import { AuthProvider } from './context/AuthContext';

import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
const Stack = createNativeStackNavigator();

function App() {
  useEffect(() => {
    // Initialize Aptabase after component mounts to ensure native modules are ready
    init("A-US-0641767039");
  }, []);

  return (
    <AuthProvider>
      <NavigationContainer ref={navigationRef}>
        <Stack.Navigator
          screenOptions={{
            headerShown: false
          }}>
          <Stack.Screen name="AppNav" component={AppNavigator} />
          <Stack.Screen name="RootAuth" component={AuthStackNavigator} />
        </Stack.Navigator>
      </NavigationContainer>
    </AuthProvider>
  )
}

export default App;

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#fff',
  },
});