# Signing & the tester → Play Store upgrade path

How Android signing works in this project, why direct test APKs and the Play
release must share a signature, and what to do about the one signing wrinkle
Google Play introduces.

## How EAS signing works here

- EAS stores **one Android keystore per project** on its servers and reuses it
  for **every build of that project** — `direct` APKs and `production` AABs
  are both signed with it.
- Both profiles now declare `"credentialsSource": "remote"` in `eas.json`
  (that's the default; it's explicit here so the shared-key intent is on
  record). Nothing in this repo can accidentally switch a profile to a
  different keystore.
- The keystore is generated the **first time** you run an Android build and
  EAS prompts you.  Say yes, and every later build (direct or production)
  silently reuses it.

**Golden rule: never regenerate or delete the keystore.** If `eas credentials`
ever offers to create a new one, cancel. A new keystore = a new signature =
every existing install (testers AND Play users) can no longer be updated over
the air; they'd have to uninstall and lose their data.

## Backing the keystore up (recommended)

EAS keeps a remote copy, but you should own one too. The most robust setup is
to generate the keystore yourself, keep it somewhere safe, and hand it to EAS:

```bash
# 1. Generate a keystore (keep this file + the passwords in a password manager)
keytool -genkeypair -v \
  -keystore taddlebox-upload.keystore \
  -alias taddlebox \
  -keyalg RSA -keysize 2048 -validity 10000

# 2. Upload it to EAS once — every build then uses it
npx eas-cli credentials --platform android
#   → Keystore → update → "upload my own keystore"
```

If you already built once and EAS generated the keystore for you, you can still
export your own copy through the same `eas credentials` menu (it offers
viewing/downloading the current keystore). Store the file, the keystore
password, and the key alias/password together.

## The one signing wrinkle: Google Play App Signing

Play App Signing is on by default for new apps. When you upload the AAB, Play
**re-signs** the app with Google's Play App Signing key before distributing it.
The consequences:

| Who installs | Signed with | Update source |
| --- | --- | --- |
| Testers (sideloaded direct APK) | your EAS keystore | your app-updater |
| Play users | Google's Play App Signing key | Play Store |

So at launch, a tester's sideloaded APK and the Play-distributed app have
**different signatures**. Installing the Play version over the sideloaded APK
fails with a signature mismatch — the tester must uninstall first (losing
local data).

### Option A — simplest (recommended to start)

Accept it. Before going live, tell testers to uninstall the test APK (or
install the Play version over it after uninstalling). Their account data lives
on your server, so the only loss is local device data (drafts, offline state).
This is what most teams do for a first release.

### Option B — seamless upgrade (bring your own key)

In **Play Console → Setup → App signing**, choose **"Export and upload a key"**
and upload **the same EAS keystore** as both the upload key and the app
signing key. Then Play distributes the app signed with the exact signature your
testers already have, and sideloaded test APKs upgrade cleanly to the Play
build with no uninstall.

- Must be done **before** the first production release (Play won't let you
  change the app signing key after the app is live).
- If you set this up, the EAS keystore is your **upload key**, and the
  keytool-generated file from "Backing the keystore up" is even more critical
  — losing it means Google cannot accept new uploads.

## iOS (brief)

None of this applies to iOS: testers use TestFlight (Apple signs everything),
and the app-updater is Android-only. EAS manages the iOS distribution
certificates per project the same way — same golden rule, never delete them.

## Checklist

- [ ] One keystore, generated once, reused by `direct` + `production` (EAS does this by default)
- [ ] Keystore file + passwords backed up in a password manager
- [ ] Decided the launch path: Option A (testers uninstall once) or Option B (bring your own key in Play Console before first release)
- [ ] Never clicked "generate new credentials" after the first build
