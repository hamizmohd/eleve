// Where the frontend finds the server. The website is served by the server itself, so it uses
// relative URLs. The Android/iOS app (Capacitor) runs from local files and needs the full URL.
// Change MOBILE_API_BASE to your hosted server (https://...) before publishing to the stores.
const MOBILE_API_BASE = 'http://192.168.1.5:3000';
window.API_BASE = window.Capacitor?.isNativePlatform?.() ? MOBILE_API_BASE : '';
