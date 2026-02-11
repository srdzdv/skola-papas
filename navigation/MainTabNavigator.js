import React from 'react';
import Colors from '../constants/Colors';
import { Platform } from 'react-native';
import { createBottomTabNavigator } from '@react-navigation/bottom-tabs';
import { createNativeStackNavigator } from '@react-navigation/native-stack';

import ComunicacionScreen from '../screens/ComunicacionScreen';
import MensajeDirecto from '../screens/MensajeDirecto';
import AnuncioDetail from '../screens/AnuncioDetail';
import PlaneacionList from '../screens/PlaneacionList';
import PlaneacionDetail from '../screens/PlaneacionDetail';
import AttachmentDetail from '../screens/AttachmentDetail';

import AdminHome from '../screens/AdminHome';
import AccesosHistorial from '../screens/AccesosHistorial';
import EdoCuenta from '../screens/EdoCuenta';
import PagoDetail from '../screens/PagoDetail';
import ServiciosHistorial from '../screens/ServiciosHistorial';
import FacturasList from '../screens/FacturasList';
// import AddSubscription from '../screens/AddSubscription';

import EventoList from '../screens/EventoList';
import EventoDetail from '../screens/EventoDetail';
import EventoGallery from '../screens/EventoGallery';

import InformacionScreen from '../screens/InformacionScreen';
import InformacionDetailScreen from '../screens/InformacionDetailScreen';
import CredencialScreen from '../screens/CredencialScreen';
import StoriesScreen from '../screens/StoriesScreen';

import { Ionicons } from '@expo/vector-icons';


const ComStack = createNativeStackNavigator();
function ComunicacionStack() {
  return (
    <ComStack.Navigator
    screenOptions={{
      headerShown: false
    }} >
      <ComStack.Screen name="Comunicacion" component={ComunicacionScreen} />
      <ComStack.Screen name="Escribir" component={MensajeDirecto} />
      <ComStack.Screen name="AnuncioDetail" component={AnuncioDetail} />
      <ComStack.Screen name="PlaneacionList" component={PlaneacionList} />
      <ComStack.Screen name="PlaneacionDetail" component={PlaneacionDetail} />
      <ComStack.Screen name="AttachmentDetail" component={AttachmentDetail} />
    </ComStack.Navigator>
  );
}


const AdmnStack = createNativeStackNavigator();
function AdminStack() {
  return (
    <AdmnStack.Navigator
    screenOptions={{
      headerShown: false
    }}>
      <AdmnStack.Screen name="AdminHome" component={AdminHome} />
      <AdmnStack.Screen name="AccesosHistorial" component={AccesosHistorial} />
      <AdmnStack.Screen name="EdoCuenta" component={EdoCuenta} />
      <AdmnStack.Screen name="PagoDetail" component={PagoDetail} />
      <AdmnStack.Screen name="ServiciosHistorial" component={ServiciosHistorial} />
      <AdmnStack.Screen name="FacturasList" component={FacturasList} />
      <AdmnStack.Screen name="AttachmentDetail" component={AttachmentDetail} />
      {/* <AdmnStack.Screen name="AddSubscription" component={AddSubscription} /> */}
    </AdmnStack.Navigator>
  );
}

const EventStack = createNativeStackNavigator();
function EventosStack() {
  return (
    <EventStack.Navigator
    screenOptions={{
      headerShown: false
    }}>
      <EventStack.Screen name="Eventos" component={EventoList} />
      <EventStack.Screen name="EventoDetail" component={EventoDetail} />
      <EventStack.Screen name="EventoGallery" component={EventoGallery} />
      <EventStack.Screen name="AttachmentDetail" component={AttachmentDetail} />
    </EventStack.Navigator>
  );
}

const InfoStack = createNativeStackNavigator();
function InformacionStack() {
  return (
    <InfoStack.Navigator
    screenOptions={{
      headerShown: false
    }}>
      <InfoStack.Screen name="Info" component={InformacionScreen} />
      <InfoStack.Screen name="InfoDet" component={InformacionDetailScreen} />
    </InfoStack.Navigator>
  );
}

const CredStack = createNativeStackNavigator();
function CredencialStack() {
  return (
    <CredStack.Navigator
    screenOptions={{
      headerShown: false
    }}>
      <CredStack.Screen name="Credencial" component={CredencialScreen} />
    </CredStack.Navigator>
  );
}

const StoriesStack = createNativeStackNavigator();
function HistoriasStack() {
  return (
    <StoriesStack.Navigator
    screenOptions={{
      headerShown: false
    }}>
      <StoriesStack.Screen name="Stories" component={StoriesScreen} />
    </StoriesStack.Navigator>
  );
}

const BottomTab = createBottomTabNavigator();

function BottomTabs() {
  return (
    <BottomTab.Navigator
    screenOptions={({ route }) => ({
      headerShown: false,
      tabBarIcon: ({ focused, color, size }) => {
        switch (route.name) {
          case 'ComunicacionStack':
            return <Ionicons name="chatbubbles" size={24} color={Colors.darkGrayDark} />;
          case 'HistoriasStack':
            return <Ionicons name="play-circle" size={24} color={Colors.darkGrayDark} />;
          case 'AdminStack':
            return <Ionicons name="calculator" size={24} color={Colors.darkGrayDark} />;
          case 'EventosStack':
            return <Ionicons name="calendar" size={24} color={Colors.darkGrayDark} />;
          case 'InformacionStack':
            return <Ionicons name="information-circle-outline" size={24} color={Colors.darkGrayDark} />;
          case 'CredencialStack':
            return <Ionicons name="person" size={24} color={Colors.darkGrayDark} />;
          default:
            break;
        }
      },
    })}
    >
      <BottomTab.Screen
      name="ComunicacionStack"
      component={ComunicacionStack}
      options={{tabBarLabel: 'Com'}} />
      <BottomTab.Screen
      name="HistoriasStack"
      component={HistoriasStack}
      options={{tabBarLabel: 'Historias'}} />
      <BottomTab.Screen
      name="AdminStack"
      component={AdminStack}
      options={{tabBarLabel: 'Admin'}} />
      <BottomTab.Screen 
      name="EventosStack" 
      component={EventosStack}
      options={{tabBarLabel: 'Eventos'}} />
      <BottomTab.Screen 
      name="InformacionStack" 
      component={InformacionStack}
      options={{tabBarLabel: 'Info'}} />
      <BottomTab.Screen 
      name="CredencialStack" 
      component={CredencialStack}
      options={{tabBarLabel: 'Cred'}} />
    </BottomTab.Navigator>
  );
}

export default BottomTabs;
