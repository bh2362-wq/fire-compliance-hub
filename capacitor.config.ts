import type { CapacitorConfig } from '@capacitor/cli';

const config: CapacitorConfig = {
  appId: 'com.bhofire.firelogbook.engineer',
  appName: 'BHO Field',
  webDir: 'dist',
  ios: {
    contentInset: 'always',
    backgroundColor: '#F2F1ED',
  },
};

export default config;
