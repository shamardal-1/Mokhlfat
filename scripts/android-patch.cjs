/* Adds the Android permissions/settings the app needs. Safe to run many times. */
const fs = require('fs'), path = require('path');
const mf = path.join(__dirname, '..', 'android', 'app', 'src', 'main', 'AndroidManifest.xml');
if (!fs.existsSync(mf)) { console.error('android/ not found — run: npx cap add android'); process.exit(1); }
let x = fs.readFileSync(mf, 'utf8');
const perms = [
  '<uses-permission android:name="android.permission.RECORD_AUDIO" />',
  '<uses-permission android:name="android.permission.WRITE_EXTERNAL_STORAGE" android:maxSdkVersion="29" />',
  '<uses-permission android:name="android.permission.READ_EXTERNAL_STORAGE" android:maxSdkVersion="32" />',
];
for (const p of perms) { const name = p.match(/name="([^"]+)"/)[1]; if (!x.includes(name)) x = x.replace('</manifest>', '    ' + p + '\n</manifest>'); }
if (!x.includes('android.speech.RecognitionService')) x = x.replace('</manifest>', '    <queries>\n        <intent><action android:name="android.speech.RecognitionService" /></intent>\n    </queries>\n</manifest>');
if (!x.includes('android:requestLegacyExternalStorage')) x = x.replace('<application', '<application\n        android:requestLegacyExternalStorage="true"');
x = x.replace(/android:screenOrientation="[^"]*"\s*/g, '').replace('<activity', '<activity\n            android:screenOrientation="portrait"');
fs.writeFileSync(mf, x);
console.log('AndroidManifest.xml patched ✓');
