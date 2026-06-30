import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.strattonoakmont.app',
  appName: 'Stratton Oakmont',
  webDir: 'dist/frontend/browser',
  server: {
    url: 'https://gsfawkes.duckdns.org:5001',
    cleartext: false,
  },
  plugins: {
    StatusBar: {
      style: 'DARK',
      backgroundColor: '#111827',
    },
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 1500,
      backgroundColor: '#0f172a',
      showSpinner: false,
    },
  },
};

export default config;
