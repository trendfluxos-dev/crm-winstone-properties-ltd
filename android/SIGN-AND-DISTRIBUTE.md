# Winstone Connect — Android Studio এ খুলে নিজের কী দিয়ে সাইন করা

এই ফোল্ডারটি একটি সম্পূর্ণ Android Studio প্রজেক্ট। ভেতরে কোনো গোপন কী নেই — আপনি নিজের keystore দিয়ে সাইন করবেন।

## ১) খুলুন
Android Studio → **Open** → এই ফোল্ডার বাছুন → Gradle sync শেষ হওয়া পর্যন্ত অপেক্ষা করুন।

## ২) নিজের কী তৈরি করুন (একবারই)
Android Studio → **Build → Generate Signed App Bundle / APK → APK → Create new…**
- Key store path: যেমন `~/keys/winstone-release.jks`
- Password, key alias, key password ঠিক করে লিখে রাখুন — হারালে আর একই অ্যাপ আপডেট দেওয়া যাবে না।

## ৩) কী-এর তথ্য প্রজেক্টে দিন
`local.properties.example` কপি করে `local.properties` নাম দিন, তারপর নিজের মান বসান:

```
sdk.dir=/path/to/Android/sdk
RELEASE_STORE_FILE=/absolute/path/winstone-release.jks
RELEASE_STORE_PASSWORD=আপনার পাসওয়ার্ড
RELEASE_KEY_ALIAS=আপনার alias
RELEASE_KEY_PASSWORD=আপনার key পাসওয়ার্ড
CRM_BASE_URL=https://webcrm.winstonebd.com
```

`local.properties` কখনো কাউকে পাঠাবেন না।

## ৪) APK তৈরি করুন
টার্মিনালে:

```
./gradlew clean assembleRelease
```

ফাইল পাবেন: `app/build/outputs/apk/release/app-release.apk`

## ৫) অফিসে বিতরণ
APK ফাইলটি এজেন্টদের দিন (ইমেইল, ড্রাইভ লিংক বা সরাসরি ফোনে কপি)। ফোনে ইনস্টলের সময়:
- "Unknown sources / এই সোর্স থেকে ইনস্টল" অনুমতি দিতে হবে
- অ্যাপ চালুর পর **ফোন, কল লগ, মাইক্রোফোন, স্টোরেজ** — সব অনুমতি দিতে হবে, নাহলে কল রেকর্ডিং জমা হবে না

## গুরুত্বপূর্ণ
- একই keystore দিয়েই ভবিষ্যতের সব আপডেট সাইন করতে হবে।
- অ্যাপে এজেন্ট প্রথমবার ফোন নম্বর + পাসওয়ার্ড দিয়ে লগইন করলে ডিভাইসটি CRM-এ নিবন্ধিত হয়; IT Console থেকে যেকোনো সময় বাতিল করা যায়।
