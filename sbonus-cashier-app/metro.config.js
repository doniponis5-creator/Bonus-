const { getDefaultConfig } = require('expo/metro-config');

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(__dirname);

// Увеличиваем лимиты и отключаем watch для некоторых папок чтобы избежать EMFILE на Mac
config.watchFolders = [];

module.exports = config;
