import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.medibrief.health',
  appName: 'MediBrief',
  webDir: 'dist',
  server: {
    // Allows connecting to local Wi-Fi or HTTP backend endpoints during testing
    cleartext: true,
    androidScheme: 'https'
  },
  android: {
    allowMixedContent: true,
    captureInput: true
  }
};

export default config;
