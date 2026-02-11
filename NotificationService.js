import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import AsyncStorage from '@react-native-async-storage/async-storage';

class NotificationService {
  static async registerForPushNotificationsAsync(presentFeedback) {
    if (Device.isDevice) {
      const { status: existingStatus } = await Notifications.getPermissionsAsync();
      let finalStatus = existingStatus;
      console.log("EXPO_finalStatus: " + finalStatus);
      if (existingStatus !== 'granted') {
        const { status } = await Notifications.requestPermissionsAsync();
        finalStatus = status;
      }
      if (finalStatus !== 'granted') {
        presentFeedback("Otorgar permisos", "Debes otorgar permisos para recibir notificaciones");
        return;
      }
      const projectId =
        Constants?.expoConfig?.extra?.eas?.projectId ?? Constants?.easConfig?.projectId;
      if (!projectId) {
        presentFeedback("Ocurrió algo inesperado", "Situación: Project ID not found");
      }
      try {
        const pushTokenString = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
        console.log("EXPO_pushTokenString: " + pushTokenString);
        // Skola logic 
        await AsyncStorage.setItem('expoPushToken', pushTokenString);
      } catch (e) {
        presentFeedback("Ocurrió algo inesperado", "Situación: " + e);
      }
    } else {
      presentFeedback("Notificaciones deshabilitadas", "Debes usar un dispositivo físico para recibir notificaciones");
    }
  }
}

export default NotificationService;