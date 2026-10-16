# DHS Portal Android launcher

This Android app opens the live DHS Portal in the device's default browser:
https://dhs-portal.onrender.com

Opening the portal in a browser is intentional because Google OAuth sign-in is not supported reliably inside embedded WebViews. The app itself does not store portal passwords or credentials.

## Build
The GitHub Actions workflow builds a debug APK. Install the generated APK on an Android device and tap **DHS Portal** to open the portal.
