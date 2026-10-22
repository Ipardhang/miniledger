
import { Platform } from 'react-native';

// Android emulator uses 10.0.2.2.
// Physical iPhones must use your Mac's LAN IP address.
export const API_URL =
  process.env.EXPO_PUBLIC_API_URL ??
  (Platform.OS === 'android'
    ? 'http://10.0.2.2:4000'
    : 'http://192.168.29.215:4000');
