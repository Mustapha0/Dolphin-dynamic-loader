# Get your APK from GitHub (quickest path)

1. Create a new GitHub repository and upload the **contents** of this folder (so `.github/`, `app/`, `build.gradle` are at the repo root).
2. In GitHub: Settings > Secrets and variables > Actions > New repository secret, add `DOLPHIN_BUILD_TOKEN` with the exact same value as Render's `BUILD_TOKEN`. The Render API URL is already configured as `https://dolphin-dynamic-loader-3.onrender.com`. If you add a `DOLPHIN_BUILD_API` secret, it overrides the default URL. Never commit the token into source code.
3. Open the **Actions** tab > "Build Dolphin App Builder APK" > **Run workflow** (it also runs on every push to main).
4. When it finishes, open the run and download the artifact **Dolphin-App-Builder-debug-apk**. Unzip it and install `app-debug.apk` on your phone (allow "install unknown apps").

Note: the app is the client. Building your React ZIPs needs the build service in `server/` running somewhere reachable over HTTPS. This source ZIP does not include a hosted build server; a real API URL/token must be configured after deployment.

# Dolphin App Builder — full React project mode

Dolphin accepts complete React/Vite project ZIPs and delegates builds to a remote service. The service installs npm dependencies, runs `npm run build`, then returns either a ZIP of `dist/` or an Android debug APK containing the production bundle.

## Requirements
- Docker on a Linux server with internet access and enough RAM/disk for npm + Android SDK builds.
- HTTPS reverse proxy in production.
- A long random `BUILD_TOKEN` shared with the Android client. Do not commit real secrets.

## Run build service
```sh
cd server
cp .env.example .env
# Edit .env and set BUILD_TOKEN to a long random secret
# Build and run (pass the secret through your deployment environment)
docker build -t dolphin-builder .
docker run -d --name dolphin-builder -p 8080:8080 -e BUILD_TOKEN='YOUR_LONG_RANDOM_SECRET' -v dolphin-jobs:/app/jobs dolphin-builder
```
Health check: `GET /health`. Protect the service behind HTTPS and restrict access. Uploaded project scripts execute on the builder; for public use, run each job in a disposable, network-restricted container/VM with CPU, memory, process, and time limits. This sample service is not a hardened multi-tenant sandbox. Do not expose it to unknown users: uploaded npm lifecycle/build scripts are untrusted code. The Docker image runs the service as a non-root user and does not pass the API token into child build processes, but this is not a substitute for per-job isolation.

## Configure Android client
The app includes a **Build service configuration** section where you can enter the deployed HTTPS URL and token, save them locally, and test `/health`. This avoids the empty-URL dead end, but the server must still be deployed. Alternatively, edit `app/src/main/assets/config.js`:
```js
window.DOLPHIN_BUILD_API = 'https://your-builder.example.com';
window.DOLPHIN_BUILD_TOKEN = 'same-long-random-secret';
```
Rebuild the Android client using the included GitHub Actions workflow. Never ship a shared build token in a public app for a public service; use per-user authentication or short-lived tokens for production.

## Input project format
ZIP should contain `package.json` with a `build` script and a Vite-compatible build output at `dist/`. ZIP root can be the project itself or one top-level folder containing it. Example scripts:
```json
{"scripts":{"dev":"vite","build":"vite build","preview":"vite preview"}}
```
Use a current React + Vite template, include `package-lock.json` for reproducible dependency installation, and upload source files only (omit `node_modules`, `.git`, and build output). TypeScript, CSS, images, fonts, and imports work when the selected build configuration and dependencies support them. Projects requiring backend servers, native Node APIs, native modules, or external runtime services will not automatically become offline Android apps.

## APK behavior
The exported APK contains the built `dist/` files in Android assets and opens `index.html` in a WebView. It is a debug APK, not a Play Store release. Release signing, app identity/version controls, permissions, Android back handling, offline dependency policy, and per-job sandboxing are production hardening tasks.

## Limitations / verification
The workflow is designed for complete project builds, but it has not been validated against every React project or a live Android SDK server in this environment. Builds can fail due to project-specific scripts, dependency incompatibility, memory limits, or Android toolchain issues. The service expects the output directory `dist/` (the default Vite production output). The Android wrapper uses AndroidX WebViewAssetLoader and relative asset paths so Vite module scripts can load from app assets.


## Android background build support

The Android app starts a foreground `dataSync` service while a build is uploading, running, being polled, and downloading. It displays an ongoing notification and holds a partial wake lock (up to six hours) to reduce interruptions when the screen is off. The service is stopped when the build flow finishes. Android/OEM battery policies can still interrupt work, and force-stopping the app stops it. The remote build job itself continues on the server after the server has accepted the request, subject to the server/hosting staying available.
