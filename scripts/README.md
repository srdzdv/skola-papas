# Build Scripts

## patch-fabric-components.sh

### Purpose
This script patches the auto-generated `RCTThirdPartyComponentsProvider.mm` file to prevent iOS crashes when the React Native new architecture is disabled.

### The Problem
When using React Native 0.81.x with Expo and the new architecture disabled (`newArchEnabled: false`), the codegen process still generates Fabric component registrations. These Fabric component classes don't exist at runtime when the new architecture is disabled, causing `NSClassFromString()` to return `nil`. When iOS tries to create an `NSDictionary` with these nil values, the app crashes immediately on launch with:

```
*** -[__NSPlaceholderDictionary initWithObjects:forKeys:count:]: attempt to insert nil object from objects[0]
```

### The Solution
The patch modifies the generated file to:
1. Create a mutable dictionary instead of an immutable one
2. Check each class for nil before adding it to the dictionary
3. Only include classes that actually exist at runtime

### When It Runs
The script automatically runs:
- After `npm run prebuild` or `npm run prebuild:clean` (via postprebuild hook in package.json)
- During local iOS pod install (via post_install hook in ios/Podfile - runs but may need manual re-run after codegen)
- During EAS builds (via eas-build-pre-upload.sh hook, which runs after prebuild but before the build)

### Manual Execution
If needed, you can run it manually:
```bash
npm run postprebuild
```

### Files Modified
- `ios/build/generated/ios/RCTThirdPartyComponentsProvider.mm`

### Related Configuration Changes
- `App.js`: Moved Aptabase initialization from module level to useEffect hook
- `app.json`: Added top-level `newArchEnabled: false` configuration
- `package.json`: Added postprebuild script
- `ios/Podfile`: Added post_install hook to run patch after pod install
- `eas-build-post-install.sh`: EAS hook that ensures scripts are executable
- `eas-build-pre-upload.sh`: EAS hook that applies the patch after prebuild
- `eas.json`: Added prebuild configuration for all build profiles

### Important Notes
- This patch is safe and only filters out nil values
- It doesn't affect functionality when classes do exist
- The script is idempotent - running it multiple times is safe
- If Expo updates the codegen to handle this properly, this script can be removed

### Testing
After applying this patch:
1. Build the app for TestFlight: `eas build --platform ios --profile production`
2. The app should launch without crashing
3. All React Native components should work normally

### Future Considerations
This workaround may not be needed in future versions of React Native/Expo when:
- React Native properly handles disabled new architecture in codegen
- Expo updates their prebuild process to not generate these files when new architecture is disabled
- The project is migrated to use the new architecture

