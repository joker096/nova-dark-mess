// Download URLs for Mess&Anger installers.
// These are served from the site root (https://mess.cvr.name/releaseUrls.js).
// Keep in sync with `scripts/deploy-*.ps1` artifacts.
//
// Consumed by `app.js`:
//   globalThis.MessAngerReleaseUrls = { android: "...", ios: "..." }
// and the `releases.json` manifest fetched from `/releases/releases.json`.
//
// The project ships mobile builds only — there are no desktop installers.

// Site base for release assets. Served from the site root.
globalThis.MessAngerReleaseUrls = {
  base: 'https://mess.cvr.name',
  // Android: Google Play listing
  android: 'https://play.google.com/store/apps/details?id=com.messanger.e2e',
  // iOS: App Store listing (empty until the listing is live)
  ios: '',

  /**
   * Resolve the download URL for a manifest file entry.
   * @param {object} manifest  releases.json ({ version, assets })
   * @param {string} file      filename, e.g. "NovaDarkMessenger-1.0.0-setup.exe"
   * @param {string} _pageUrl  page URL (kept for signature symmetry)
   * @returns {string|null}
   */
  assetUrl: function (manifest, file, _pageUrl) {
    const a = manifest && manifest.assets;
    if (!a) return null;
    // Exact filename match wins, else prefix match, else platform key.
    for (const [plat, entry] of Object.entries(a)) {
      if (typeof entry === 'object' && entry && entry.url) {
        if (file === entry.fileName || (file || '').endsWith(entry.fileName || '')) return entry.url;
        if (file && file.indexOf(plat) !== -1) return entry.url;
      }
    }
    return (file && (this.base || 'https://mess.cvr.name') + '/releases/' + file) || null;
  },

  /**
   * Validate a URL is safe (http/https) and returns it, else null.
   * @param {string} url
   * @returns {string|null}
   */
  safeUrl: function (url) {
    if (!url) return null;
    if (/^https?:\/\//i.test(url)) return url;
    return null;
  },
};
