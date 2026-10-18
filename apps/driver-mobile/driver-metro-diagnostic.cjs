const { getDefaultConfig } = require("expo/metro-config");
const config = getDefaultConfig(process.cwd());

console.log("METRO DEFAULTS");
console.log(JSON.stringify({
  projectRoot: config.projectRoot,
  watchFolders: config.watchFolders,
  nodeModulesPaths: config.resolver.nodeModulesPaths,
  extraNodeModules: config.resolver.extraNodeModules,
  disableHierarchicalLookup: config.resolver.disableHierarchicalLookup,
  unstable_enablePackageExports: config.resolver.unstable_enablePackageExports
}, null, 2));

console.log("\nNODE RESOLUTION");
for (const name of ["react", "react/jsx-runtime", "@types/react"]) {
  try {
    console.log(`${name} => ${require.resolve(name)}`);
  } catch (error) {
    console.log(`${name} => FAILED: ${error.message}`);
  }
}
