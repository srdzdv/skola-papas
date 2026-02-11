# Skola Papas

Mobile app for parents to stay connected with their children's school. Built with React Native and Expo.

## Features

- **Comunicacion** - Announcements, messages, and direct communication with school staff
- **Eventos** - School events with RSVP, photo galleries, and calendar views
- **Admin** - Account statements, payments, service requests, and invoicing
- **Informacion** - School policies, documents, and resources
- **Credencial** - Digital student ID cards with QR code support
- **Planeacion** - Weekly class planning and activities
- **Stories** - Photo/video stories shared by the school

## Tech Stack

- **Framework:** React Native 0.81 + Expo SDK 54 (New Architecture enabled)
- **Navigation:** React Navigation 6 (bottom tabs + native stacks)
- **Backend:** Parse Server (multi-school support)
- **Storage:** AWS S3 via Parse Cloud Functions
- **Notifications:** Expo Notifications (push tokens via EAS)
- **Analytics:** Aptabase
- **OTA Updates:** EAS Update

## Prerequisites

- Node.js >= 18
- Expo CLI (`npm install -g expo-cli`)
- EAS CLI (`npm install -g eas-cli`)
- Xcode (for iOS builds)
- Android Studio (for Android builds)

## Getting Started

```bash
# Install dependencies
npm install

# Generate native projects
npm run prebuild:clean

# Run on iOS simulator
npm run ios

# Run on Android emulator
npm run android

# Start Metro bundler only
npm start
```

## Build

```bash
# Development (internal distribution)
eas build --profile development --platform ios
eas build --profile development --platform android

# Production
eas build --profile production --platform ios
eas build --profile production --platform android
```

## OTA Updates

```bash
# Push a JS update without a new binary
eas update --channel production --message "description of changes"
```

## Project Structure

```
screens/          # Screen components (22+ screens)
navigation/       # React Navigation setup (tabs, stacks, auth flow)
components/       # Reusable UI components
services/         # API response handling, image uploads, auth interceptor
context/          # AuthContext (session management)
constants/        # Colors, layout, app constants
utils/            # dayjs setup, retry with backoff
plugins/          # Expo config plugins
assets/           # Images, icons, splash screens
```
