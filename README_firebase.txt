# RootGrowings Firebase Setup

1. Install Firebase SDK:
   npm install firebase

2. Create `firebase-config.js` in your src/ or js/ folder with your real Firebase config.

3. Use `app_cloud.js` for:
   - Google login
   - Adding, reading, updating, deleting plants
   - Uploading plant images to Firebase Storage

4. In your HTML or main JS file:
   import { loginWithGoogle, addPlant, getPlants } from './app_cloud.js';

5. For Apple login or Email/Password auth:
   - Enable them in Firebase Console → Authentication → Sign-in methods.
   - Adjust app_cloud.js to include these providers.
