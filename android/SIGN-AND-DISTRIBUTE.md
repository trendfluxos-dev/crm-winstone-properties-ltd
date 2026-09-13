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

## ৬) নতুন ভার্সন সব কম্পানি ফোনে পৌঁছানো (v1.8 থেকে)
1. `versionCode` / `versionName` বাড়িয়ে `./gradlew clean assembleRelease` চালান।
2. IT Console → **ফোন অ্যাপের নতুন ভার্সন** → একই version code/name দিয়ে APK আপলোড করুন।
3. প্রকাশের পর প্রতিটি ফোনের অ্যাপ খোলার সময় নিজেই "নতুন ভার্সন এসেছে" ব্যানার দেখাবে;
   এজেন্ট **ডাউনলোড ও ইনস্টল** চাপলে ফোন নিজের ইনস্টল অনুমতি চাইবে।
4. "বাধ্যতামূলক" টিক দিলে ব্যানার এড়ানো যাবে না।
5. একই প্যানেলে দেখা যায় কোন ফোন কোন ভার্সনে আছে — যেসব ফোনে এখনো পুরনো ভার্সন,
   সেগুলো "আপডেট বাকি" হিসেবে দেখাবে। কোনো ফোনে দূর থেকে জোর করে ইনস্টল করা যায় না।
