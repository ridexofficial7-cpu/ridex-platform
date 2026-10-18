module.exports = ({ config }) => ({
  ...config,
  android: { ...(config.android || {}) },
  // No bundled Google/Firebase credentials or privileged key is loaded here.
});
