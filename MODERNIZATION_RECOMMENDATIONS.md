# Skola Papas - Modernization Recommendations

Based on Expo's modernization best practices and an analysis of the current codebase (Expo SDK 54, React Native 0.81.4, New Architecture enabled).

---

## 1. Adopt Continuous Native Generation (CNG) / Full Expo Prebuild

The `ios/` and `android/` directories are currently checked into git and manually maintained. With CNG, native directories are generated from `app.json` + config plugins, never committed.

**Benefits:**
- SDK upgrade time reduced by up to 80%
- No orphaned native code accumulates over time
- Native config lives in version-controlled JS (config plugins)

**Steps:**
1. Add `ios/` and `android/` to `.gitignore`
2. Move any manual native config into config plugins (like the existing `withGradleTimeout.js`)
3. Run `npx expo prebuild` to regenerate native directories
4. Validate builds with `eas build`

**References:**
- [Continuous Native Generation](https://docs.expo.dev/workflow/continuous-native-generation/)
- [Adopt Prebuild](https://docs.expo.dev/guides/adopting-prebuild/)

---

## 2. Migrate from React Navigation to Expo Router

Currently using `@react-navigation/native` v6 with manual stack/tab definitions across `navigation/AppNavigator.js`, `MainTabNavigator.js`, and `AuthStackNavigation.js`.

**Benefits:**
- Automatic deep linking for every screen (zero config)
- Type-safe navigation out of the box
- Deferred bundling (screens load only when needed)
- Web support if the app ever goes cross-platform

**Current structure mapping:**

| Current | Expo Router Equivalent |
|---------|----------------------|
| `screens/LoginScreen.js` | `app/(auth)/login.tsx` |
| `screens/ComunicacionScreen.js` | `app/(tabs)/comunicacion/index.tsx` |
| `screens/EventoList.js` | `app/(tabs)/eventos/index.tsx` |
| `screens/AdminHome.js` | `app/(tabs)/admin/index.tsx` |
| `navigation/MainTabNavigator.js` | `app/(tabs)/_layout.tsx` |
| `navigation/AppNavigator.js` | `app/_layout.tsx` |

**References:**
- [Migrate from React Navigation](https://docs.expo.dev/router/migrate/from-react-navigation/)
- [Expo Router Introduction](https://docs.expo.dev/router/introduction/)

---

## 3. Replace `moment.js` with a Lighter Alternative

`moment` (v2.30.1) is ~300KB and officially in maintenance mode. The app uses it for date formatting with Spanish locale.

**Options:**

| Library | Size | Spanish Locale | moment-compatible API |
|---------|------|---------------|----------------------|
| `dayjs` | ~2KB | Yes (`dayjs/locale/es`) | Yes (drop-in) |
| `date-fns` | ~13KB per function | Yes (`date-fns/locale/es`) | No (functional API) |

**Recommendation:** `dayjs` for easiest migration since it has a nearly identical API to moment.

**Steps:**
1. `npm install dayjs`
2. Replace `import moment from 'moment'` with `import dayjs from 'dayjs'`
3. Replace `moment.locale('es')` with `import 'dayjs/locale/es'` + `dayjs.locale('es')`
4. Most `.format()`, `.fromNow()`, `.diff()` calls work identically
5. `npm uninstall moment`

---

## 4. Remove or Replace `aws-sdk` v2

`aws-sdk` (v2.1535.0) is in the dependencies — this package is ~50MB+ unpacked and pulls in modules for every AWS service.

**Current usage:** S3 operations already go through Parse Cloud Functions (`uploadAWSS3Object`, `getAWSS3SignedUrl`). The client-side SDK may be redundant.

**Options:**
1. **Remove entirely** — route all S3 operations through Cloud Functions (preferred)
2. **Replace with v3 modular SDK** — `@aws-sdk/client-s3` is ~1/10th the size

**Steps (Option 1):**
1. Audit all imports of `aws-sdk` in client code
2. Verify all S3 operations use Cloud Functions via `Parse.Cloud.run()`
3. Remove any direct S3 client usage
4. `npm uninstall aws-sdk`

---

## 5. Implement EAS Update for OTA Updates

The `eas.json` has build profiles but no EAS Update configuration. OTA updates allow pushing JS bundle changes instantly without app store review.

**Benefits:**
- Ship bug fixes in minutes, not days
- Rollback capabilities
- Channel-based targeting (staging vs production)

**Steps:**
1. `npx eas update:configure`
2. Add to `app.json`:
```json
"updates": {
  "url": "https://u.expo.dev/<project-id>"
},
"runtimeVersion": {
  "policy": "appVersion"
}
```
3. Publish updates: `eas update --branch production --message "fix: description"`

---

## 6. Add Crash Reporting (Sentry)

The app uses Aptabase for analytics but has no crash reporting. Unhandled JS exceptions and native crashes go undetected.

**Recommendation:** `@sentry/react-native` with the Expo config plugin.

**Steps:**
1. `npx expo install @sentry/react-native`
2. Add to `app.json` plugins:
```json
["@sentry/react-native/expo", {
  "organization": "your-org",
  "project": "skola-papas"
}]
```
3. Initialize in `App.js`:
```js
import * as Sentry from '@sentry/react-native';
Sentry.init({ dsn: 'https://your-dsn@sentry.io/project-id' });
```
4. Wrap root component with `Sentry.wrap(App)`

---

## 7. Add `expo-dev-client` for Development

No custom dev client is configured. Using bare `react-native run-ios` loses Expo DX benefits.

**Benefits:**
- Expo Go-like convenience with custom native modules
- Faster iteration during development
- Better error overlay and debugging tools

**Steps:**
1. `npx expo install expo-dev-client`
2. Build dev client: `eas build --profile development --platform ios`
3. Start dev server: `npx expo start --dev-client`

---

## 8. Lazy Load Screens

With 22+ screens loaded eagerly, startup time is impacted. Screens that aren't immediately visible (Admin, Credencial, Informacion) can be deferred.

**Implementation (manual, without Expo Router):**
```js
const AdminHome = React.lazy(() => import('./screens/AdminHome'));
const CredencialScreen = React.lazy(() => import('./screens/CredencialScreen'));

// Wrap in Suspense
<Suspense fallback={<ActivityIndicator />}>
  <AdminHome />
</Suspense>
```

> Note: This is automatic with Expo Router's deferred bundling.

---

## 9. Upgrade React Navigation to v7 (if not migrating to Expo Router)

If migrating to Expo Router is too large a change, upgrading to React Navigation 7 still provides:
- Static configuration API with better type safety
- Improved performance with New Architecture (already enabled)
- Preloading support for screens

**References:**
- [React Navigation 7 docs](https://reactnavigation.org/docs/7.x/getting-started)

---

## 10. Evaluate Parse Server Hosting

`ParseInit.js` has 7 Heroku-hosted Parse servers. Heroku's performance (especially cold starts) can affect perceived app speed.

**Alternatives:**
- **Railway** — simple migration from Heroku, faster cold starts
- **Render** — free tier available, auto-deploy from git
- **Fly.io** — edge deployment, lowest latency

---

## Priority Matrix

| # | Improvement | Impact | Effort | Priority |
|---|------------|--------|--------|----------|
| 4 | Remove/replace `aws-sdk` v2 | High (bundle size) | Low | P0 |
| 3 | Replace `moment.js` | Medium (bundle size) | Medium | P1 |
| 5 | Add EAS Update | High (deployment speed) | Low | P1 |
| 6 | Add crash reporting | High (reliability) | Low | P1 |
| 1 | Adopt CNG (Prebuild) | High (maintainability) | Medium | P2 |
| 7 | Add `expo-dev-client` | Medium (DX) | Low | P2 |
| 8 | Lazy load screens | Medium (startup perf) | Medium | P3 |
| 2 | Migrate to Expo Router | High (DX + perf) | High | P3 |
| 9 | Upgrade React Nav to v7 | Medium (perf) | Medium | P3 |
| 10 | Migrate Parse hosting | Medium (latency) | High | P4 |
