import type { CapacitorConfig } from "@capacitor/cli";

// appId is permanent once the app is on Google Play / App Store.
// Change it to your own reverse domain before the first upload.
const config: CapacitorConfig = {
  appId: "com.quantumtechnologies.cuadra",
  appName: "Cuadra",
  webDir: "dist",
  backgroundColor: "#1ec96b",
  android: {
    backgroundColor: "#1ec96b"
  },
  ios: {
    backgroundColor: "#1ec96b",
    contentInset: "never"
  }
};

export default config;
