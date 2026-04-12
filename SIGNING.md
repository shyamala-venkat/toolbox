# Code Signing & Notarization Guide

ToolBox uses Tauri 2's built-in signing pipeline. When the right environment
variables are set, `npm run tauri build` automatically signs the binary,
notarizes it with Apple, and signs the update bundle for the auto-updater.

## Quick Start

### Step 1: Generate the updater signing keypair (one-time)

```bash
npx tauri signer generate -w ~/.tauri/toolbox.key
```

Enter a strong password when prompted. This creates:
- `~/.tauri/toolbox.key` — **private key** (NEVER commit this)
- Prints the **public key** to stdout — copy it

Then update `src-tauri/tauri.conf.json`:
```json
"plugins": {
  "updater": {
    "pubkey": "PASTE_THE_PUBLIC_KEY_HERE"
  }
}
```

### Step 2: Apple Developer Setup (macOS signing)

1. **Enroll in the Apple Developer Program** — <https://developer.apple.com/programs/> ($99/yr)
2. **Create a Developer ID Application certificate**:
   - Open Xcode → Settings → Accounts → Manage Certificates
   - Click `+` → "Developer ID Application"
   - Or via Keychain Access → Certificate Assistant → Request from CA → upload to Apple
3. **Export the certificate as .p12**:
   - Keychain Access → find "Developer ID Application: Your Name"
   - Right-click → Export → save as `.p12` with a password
4. **Create an App-Specific Password** for notarization:
   - <https://appleid.apple.com/> → Sign-In & Security → App-Specific Passwords
   - Generate one, label it "ToolBox Notarization"
5. **Find your Team ID**:
   - <https://developer.apple.com/account/> → Membership Details → Team ID (10 chars)

### Step 3: Set environment variables

Create a `.env` file at the project root (gitignored) or set these in your shell profile:

```bash
# ── Tauri Updater Signing ──
# The private key content (not the file path)
export TAURI_SIGNING_PRIVATE_KEY=$(cat ~/.tauri/toolbox.key)
export TAURI_SIGNING_PRIVATE_KEY_PASSWORD="your-key-password"

# ── macOS Code Signing ──
# Base64-encoded .p12 certificate
export APPLE_CERTIFICATE=$(base64 -i ~/path/to/certificate.p12)
export APPLE_CERTIFICATE_PASSWORD="your-p12-password"
export APPLE_SIGNING_IDENTITY="Developer ID Application: Your Name (TEAMID)"

# ── macOS Notarization ──
export APPLE_ID="your-apple-id@example.com"
export APPLE_PASSWORD="your-app-specific-password"
export APPLE_TEAM_ID="XXXXXXXXXX"
```

### Step 4: Build with signing

```bash
npm run tauri build
```

Tauri automatically:
1. Signs the `.app` bundle with your Developer ID certificate
2. Creates the `.dmg` installer
3. Submits the `.app` to Apple's notary service
4. Staples the notarization ticket to the `.app`
5. Signs the update bundle (`.tar.gz`) with the updater private key
6. Generates `latest.json` manifest for the auto-updater

### Step 5: Verify signing

```bash
# Check code signature
codesign --verify --deep --strict src-tauri/target/release/bundle/macos/ToolBox.app

# Check Gatekeeper approval
spctl --assess --type exec src-tauri/target/release/bundle/macos/ToolBox.app

# Check notarization
xcrun stapler validate src-tauri/target/release/bundle/macos/ToolBox.app
```

All three should pass without errors.

---

## Windows Code Signing (future)

Options:
- **Sectigo** OV code signing cert (~$70/yr) — traditional approach
- **Azure Trusted Signing** — newer, cloud-based, integrates with CI/CD
- **SignPath** — free for open source, paid for commercial

Tauri 2 on Windows uses `signtool.exe` with these env vars:
```bash
export TAURI_SIGNING_IDENTITY="Your Company Name"
# Or use a PFX file:
export TAURI_SIGNING_PFX="path/to/cert.pfx"
export TAURI_SIGNING_PFX_PASSWORD="password"
```

---

## GitHub Actions (CI/CD)

For automated signed builds, add these as GitHub repository secrets:
- `TAURI_SIGNING_PRIVATE_KEY`
- `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`
- `APPLE_CERTIFICATE` (base64)
- `APPLE_CERTIFICATE_PASSWORD`
- `APPLE_SIGNING_IDENTITY`
- `APPLE_ID`
- `APPLE_PASSWORD`
- `APPLE_TEAM_ID`

The CI workflow (`.github/workflows/release.yml`) uses these secrets to produce
signed binaries for all platforms on every tagged release.

---

## Security Notes

- **Private keys** (`~/.tauri/toolbox.key`, `.p12` certificates) must NEVER be committed to git
- `.env` is in `.gitignore` — credentials stay local
- In CI, use GitHub Secrets (encrypted at rest)
- The updater public key in `tauri.conf.json` IS safe to commit — it's public by design
- Rotate the app-specific password if compromised
- The updater verifies signatures on the client before installing — a tampered update is rejected
