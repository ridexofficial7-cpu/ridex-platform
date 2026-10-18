const fs = require("fs");

module.exports = ({ config }) => {
  const android = { ...(config.android ?? {}) };
  const configuredGoogleServices = process.env.GOOGLE_SERVICES_JSON || null;
  const bundledGoogleServices = fs.existsSync("./google-services.json") ? "./google-services.json" : null;
  const googleServicesFile = configuredGoogleServices || bundledGoogleServices;

  // app.json in the distributed source may contain a placeholder path, but
  // Expo must not be handed a missing file. Push delivery still requires the
  // real Firebase google-services.json at build/deployment time.
  delete android.googleServicesFile;
  if (googleServicesFile) android.googleServicesFile = googleServicesFile;

  return {
    ...config,
    android,
    plugins: [
      ...(config.plugins ?? []),
      [
        "react-native-maps",
        {
          androidGoogleMapsApiKey:
            process.env.EXPO_PUBLIC_ANDROID_GOOGLE_MAPS_KEY || "",
          iosGoogleMapsApiKey:
            process.env.EXPO_PUBLIC_IOS_GOOGLE_MAPS_KEY || "",
        },
      ],
    ],
  };
};
