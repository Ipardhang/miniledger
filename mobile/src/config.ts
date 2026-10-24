import { Platform } from 'react-native';

const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL?.trim();

export const API_URL =
  configuredApiUrl ||
  (__DEV__
    ? Platform.OS === 'android'
      ? 'http://10.0.2.2:4000'
      : 'http://192.168.29.215:4000'
    : '');

if (!API_URL) {
  throw new Error('EXPO_PUBLIC_API_URL is required for production builds.');
}
