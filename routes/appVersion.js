const express = require('express');
const router = express.Router();

const CURRENT_VERSION = {
  version: '1.0.0',
  buildNumber: 1,
  minSupportedVersion: '1.0.0',
  forceUpdate: false,
  releaseNotes: 'Pierwsza wersja aplikacji GoFi!',
  androidDownloadUrl: 'https://twoj-serwer.pl/downloads/gofi-latest.apk',
  iosDownloadUrl: 'https://apps.apple.com/app/gofi/id123456789',
  releaseDate: '2026-02-18'
};

router.get('/', (req, res) => {
  res.json({
    success: true,
    data: CURRENT_VERSION
  });
});

router.get('/check/:currentVersion', (req, res) => {
  const clientVersion = req.params.currentVersion;
  const needsUpdate = compareVersions(clientVersion, CURRENT_VERSION.version) < 0;
  const needsForceUpdate = compareVersions(clientVersion, CURRENT_VERSION.minSupportedVersion) < 0;

  res.json({
    success: true,
    data: {
      needsUpdate,
      needsForceUpdate: needsForceUpdate || CURRENT_VERSION.forceUpdate,
      latestVersion: CURRENT_VERSION.version,
      currentVersion: clientVersion,
      releaseNotes: CURRENT_VERSION.releaseNotes,
      androidDownloadUrl: CURRENT_VERSION.androidDownloadUrl,
      iosDownloadUrl: CURRENT_VERSION.iosDownloadUrl
    }
  });
});

function compareVersions(v1, v2) {
  const parts1 = v1.split('.').map(Number);
  const parts2 = v2.split('.').map(Number);
  
  for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
    const p1 = parts1[i] || 0;
    const p2 = parts2[i] || 0;
    if (p1 < p2) return -1;
    if (p1 > p2) return 1;
  }
  return 0;
}

module.exports = router;
