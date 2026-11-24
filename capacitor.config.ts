import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.ijproyectos.moni',
  appName: 'Moni',
  webDir: 'dist',
  plugins: {
    SplashScreen: {
      launchShowDuration: 1500,
      launchAutoHide: true,
      backgroundColor: '#0b3d2e',
      showSpinner: false,
      androidScaleType: 'CENTER_CROP'
    }
  }
};

export default config;
