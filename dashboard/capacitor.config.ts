import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.rauli.vision',
  appName: 'RAULI-VISION',
  webDir: 'dist',
  android: {
    allowMixedContent: true,
  },
};

export default config;
