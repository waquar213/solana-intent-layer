/**
 * App-wide config. The wallet API base — the iOS simulator shares the host loopback, so
 * `localhost:8080` reaches a dev server on the same Mac. Override with EXPO_PUBLIC_API_BASE
 * (in a gitignored .env) to point at a deployed backend or a LAN IP for a physical device.
 */
export const API_BASE = process.env.EXPO_PUBLIC_API_BASE ?? 'http://localhost:8080';
