const { getDefaultConfig } = require('expo/metro-config');
const path = require('path');

const projectRoot = __dirname;
const workspaceRoot = path.resolve(projectRoot, '../..');
const localizationRoot = path.join(workspaceRoot, 'packages', 'localization');
const config = getDefaultConfig(projectRoot);
config.watchFolders = [...new Set([...(config.watchFolders || []), localizationRoot])];
config.resolver.nodeModulesPaths = [...new Set([...(config.resolver.nodeModulesPaths || []), path.join(projectRoot, 'node_modules'), path.join(workspaceRoot, 'node_modules')])];
module.exports = config;
