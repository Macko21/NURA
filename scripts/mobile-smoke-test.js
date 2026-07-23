'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const read = relativePath => fs.readFileSync(path.join(root, relativePath), 'utf8');
const exists = relativePath => fs.existsSync(path.join(root, relativePath));

const pkg = JSON.parse(read('package.json'));
const capacitor = JSON.parse(read('capacitor.config.json'));
const versionSource = read('frontend/version.js');
const gameVersion = versionSource.match(/const GAME_VERSION = "([^"]+)"/)?.[1];
const androidGradle = read('android/app/build.gradle');
const androidManifest = read('android/app/src/main/AndroidManifest.xml');
const iosProject = read('ios/App/App.xcodeproj/project.pbxproj');
const iosInfo = read('ios/App/App/Info.plist');
const preparedIndex = read('mobile-dist/index.html');

assert.strictEqual(capacitor.appId, 'com.macko.los10000');
assert.strictEqual(capacitor.webDir, 'mobile-dist');
assert.strictEqual(pkg.version, gameVersion, 'package and game versions must match');
assert(androidGradle.includes(`versionName "${gameVersion}"`), 'Android version must match the game');
assert(iosProject.includes(`MARKETING_VERSION = ${gameVersion};`), 'iOS version must match the game');
assert(androidManifest.includes('android:scheme="los10000"'), 'Android deep link is missing');
assert(iosInfo.includes('<string>los10000</string>'), 'iOS deep link is missing');
assert(preparedIndex.includes('/native-runtime.js'), 'native runtime was not injected');
assert(exists('mobile-dist/native-runtime.js'), 'native runtime was not copied');
assert(exists('mobile-dist/vendor/three.module.js'), 'Three.js module was not copied');
assert(exists('mobile-dist/vendor/three.core.min.js'), 'Three.js core was not copied');

console.log(`Mobile integration OK — v${gameVersion}, Android + iOS projects ready`);
