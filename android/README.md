
## Building this project

```bash
cp local.properties.example local.properties   # set sdk.dir + INGEST_SECRET
./gradlew assembleDebug                        # app/build/outputs/apk/debug/app-debug.apk
```
Requires JDK 17 and Android SDK 35 (build-tools 35.0.0).

The Compose desk (`ui/DeskScreen.kt`) mirrors the web `/desk`: stats row, lead queue with
Call / WhatsApp buttons, call log with AI summary + sync state, WhatsApp inbox, AI coach tab and
a new-lead form. Calls dial over the normal SIM; `CallStateReceiver` records, then `CallSyncQueue`
uploads to `/api/public/ingest/recording` with retry, so audio + AI analysis show up in
Executive HQ and IT Console.
