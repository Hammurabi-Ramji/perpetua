# Browser Extension Documentation

## Overview

The LicenseVault browser extension provides comprehensive license management capabilities directly in your web browser. It automatically detects and extracts software license keys from popular deal sites, offers smart license suggestions on software websites, and provides seamless integration with the LicenseVault application.

## Supported Browsers

- **Google Chrome** (recommended) - Full Manifest V3 support
- **Microsoft Edge** - Full Manifest V3 support
- **Firefox** - Manifest V2 compatibility mode
- **Other Chromium-based browsers** - May work with Manifest V3 support

## Features

### 🔍 Automatic License Detection & Extraction

The extension automatically monitors and extracts licenses from supported deal sites:

- **AppSumo** - Account pages and purchase confirmations
- **Product Hunt** - Deal pages and user accounts
- **StackSocial** - Account dashboard and purchase history
- **Humble Bundle** - Library and purchase pages

**Extraction Capabilities:**
- License keys in various formats (XXXX-XXXX-XXXX-XXXX, API keys, etc.)
- Product names and descriptions
- Purchase dates and expiry information
- Redemption URLs and instructions
- Download links and activation codes

### 🧠 Smart License Suggestions

When visiting software websites, the extension intelligently detects when you're on a page that requires a license:

- **Auto-detection** of software activation pages
- **License matching** against your vault
- **One-click autofill** of license keys
- **Deal suggestions** for similar software when no license is found

**Supported Software Detection:**
- Adobe Creative Cloud
- JetBrains IDEs
- GitHub (Pro features)
- Figma
- Linear, Notion, and other SaaS platforms

### 🔄 Synchronization & Integration

- **Real-time sync** with LicenseVault backend
- **OAuth authentication** flow integration
- **Background synchronization** every hour
- **Manual sync triggers** from popup
- **Cross-device synchronization**

### 🎛️ User Interface

#### Popup Dashboard
- **Quick access** to recent licenses
- **Sync controls** for all connected sites
- **Authentication status** display
- **Direct links** to main application

#### Options Page
- **API configuration** (base URL, timeouts)
- **Sync preferences** (auto-sync, notifications)
- **Site management** (connect/disconnect accounts)
- **Authentication controls** (login/logout)

#### Context Menu Integration
- **Right-click "Add to LicenseVault"** on any page
- **Text selection parsing** for manual license addition
- **Quick license key copying**

### 🔐 Security & Privacy

- **Local processing** - All license extraction happens in your browser
- **Encrypted storage** - Sensitive data stored securely in browser storage
- **No data transmission** without explicit user consent
- **OAuth-only authentication** - No password storage
- **Permission-based access** - Minimal required permissions

## Installation

### Chrome/Edge Installation

1. **Open Extensions Page**
   - Chrome: Navigate to `chrome://extensions/`
   - Edge: Navigate to `edge://extensions/`

2. **Enable Developer Mode**
   - Toggle "Developer mode" in the top-right corner

3. **Load Unpacked Extension**
   - Click "Load unpacked" button
   - Select the `browser-extension` folder from the project directory
   - The extension will appear in your extensions list

4. **Verify Installation**
   - Check that LicenseVault appears in the extensions list
   - Ensure it's enabled and has proper permissions

### Firefox Installation

1. **Open Debugging Page**
   - Navigate to `about:debugging`

2. **Load Temporary Add-on**
   - Click "This Firefox" in the sidebar
   - Click "Load Temporary Add-on"
   - Select the `manifest.json` file from the `browser-extension` folder

**Note:** Firefox installation is temporary and will be removed when the browser restarts. For permanent installation, the extension would need to be published to Mozilla Add-ons.

### Development Installation

For development and testing:

1. Clone the repository
2. Ensure the backend is running on `http://localhost:3001`
3. Load the extension as described above
4. The extension will automatically connect to the local development server

## Configuration

### Initial Setup

1. **Open Extension Options**
   - Click the extension icon in the toolbar
   - Click the gear/settings icon or right-click → "Options"

2. **Configure API Settings**
   - **API Base URL**: `http://localhost:3001` for development, or your production URL
   - **Auto-sync**: Enable/disable automatic background synchronization
   - **Notifications**: Control when to show notifications

3. **Authentication**
   - Click "Sign In" to authenticate with LicenseVault
   - Complete OAuth flow in the popup window
   - Extension will automatically detect successful authentication

### Site Connections

Connect your accounts on deal sites for automatic license detection:

1. **Navigate to a supported site** (AppSumo, Product Hunt, etc.)
2. **Log in to your account** on the site
3. **The extension will automatically detect** the connection
4. **Verify in extension options** under "Connected Sites"

**Manual Connection:**
- Visit the site and ensure you're logged in
- The extension will prompt for connection if needed
- Check "Connected Sites" in options to confirm

## Usage

### Daily Usage

1. **Automatic Detection**
   - Visit deal sites while logged in
   - Extension automatically detects new licenses
   - Notifications appear for successful extractions

2. **Manual Addition**
   - Right-click on any page containing license information
   - Select "Add License to LicenseVault"
   - Extension parses selected text and adds to your vault

3. **License Suggestions**
   - Visit software activation pages
   - Extension shows available licenses for that software
   - Click "Auto-fill License" to populate forms

### Sync Management

- **Manual Sync**: Click "🔄 Sync All Licenses" in popup
- **Auto Sync**: Runs every hour automatically (configurable)
- **Sync Status**: Check popup for last sync time and status

### Troubleshooting

#### Common Issues

**Extension Not Loading:**
- Ensure all required permissions are granted
- Try refreshing the extension in chrome://extensions/
- Check browser console for errors

**Sync Not Working:**
- Verify API base URL in options
- Check authentication status
- Ensure backend server is running
- Check network connectivity

**License Detection Failing:**
- Ensure you're logged in to the deal site
- Try refreshing the page
- Check if the site structure has changed
- Manual addition as fallback

**Authentication Issues:**
- Clear extension storage and re-authenticate
- Check OAuth callback URL configuration
- Verify backend authentication endpoints

#### Debug Mode

Enable debug logging:
1. Open extension options
2. Check "Enable debug logging"
3. Open browser developer tools
4. Check console for LicenseVault logs

## Development

### Project Structure

```
browser-extension/
├── manifest.json          # Extension manifest
├── background.js          # Service worker
├── popup/                 # Popup interface
│   ├── popup.html
│   ├── popup.js
│   └── popup.css
├── options/               # Options page
│   ├── options.html
│   └── options.js
├── content-scripts/       # Page content scripts
│   ├── appsumo.js
│   ├── producthunt.js
│   ├── stacksocial.js
│   ├── humblebundle.js
│   └── license-detector.js
└── lib/                   # Shared utilities
    └── extractors.js
```

### Building & Testing

1. **Development Setup**
   ```bash
   cd browser-extension
   # No build step required - files are loaded directly
   ```

2. **Testing**
   - Load as unpacked extension
   - Test on supported sites
   - Verify popup and options functionality
   - Check background script logs

3. **Content Script Development**
   - Each site has its own content script
   - Use browser developer tools to inspect page structure
   - Test extraction logic on various page types

### API Integration

The extension communicates with the LicenseVault backend via REST API:

- **Base URL**: Configurable in options (default: localhost:3001)
- **Authentication**: JWT tokens stored in chrome.storage.sync
- **Endpoints**: Standard CRUD operations for licenses and sites

### Permissions

Required permissions in manifest.json:
- `storage`: Store settings and tokens
- `activeTab`: Access current tab for content scripts
- `scripting`: Inject content scripts
- `alarms`: Background sync scheduling
- `identity`: OAuth authentication
- `host_permissions`: Access to deal sites and API

## Contributing

1. **Code Style**: Follow existing patterns and use modern JavaScript
2. **Testing**: Test on multiple browsers and sites
3. **Documentation**: Update this document for new features
4. **Security**: Never transmit sensitive data without encryption

## Changelog

### Version 1.0.0
- ✅ Complete browser extension with all core features
- ✅ Automatic license extraction from all supported sites
- ✅ Smart license suggestions and autofill
- ✅ OAuth authentication integration
- ✅ Background synchronization
- ✅ Popup dashboard and options page
- ✅ Context menu integration
- ✅ Comprehensive documentation
- Download links

### Popup Interface

Click the extension icon in the browser toolbar to access:

- **Detected Licenses**: View licenses found on the current page
- **Saved Licenses**: Access your previously saved licenses
- **Quick Actions**: Copy license keys, open redemption pages
- **Settings**: Configure extension behavior

### Background Processing

The extension runs in the background to:

- Monitor page changes
- Extract license information
- Communicate with the LicenseVault API
- Sync data across browser sessions

## Supported Sites

### AppSumo

- **Detection**: Automatic license key extraction
- **Authentication**: OAuth 2.0 integration
- **Features**: Full API access with scraping fallback

### Product Hunt

- **Detection**: License detection on product pages
- **Authentication**: OAuth 2.0 integration
- **Features**: Real-time license monitoring

### StackSocial

- **Detection**: Automated scraping of deal pages
- **Authentication**: Credential-based login
- **Features**: Bulk license extraction

### Humble Bundle

- **Detection**: License extraction from bundle pages
- **Authentication**: Credential-based login
- **Features**: Multi-license bundle support

4. **Click the extension icon** when licenses are detected

5. **Save licenses** to your LicenseVault account

### Advanced Features

#### Manual License Addition

If automatic detection misses a license:

1. Click the extension icon
2. Select "Add Manual License"
3. Fill in the license details
4. Save to your vault

#### Bulk Operations

For sites with multiple licenses:

1. The extension detects all available licenses
2. Review the list in the popup
3. Select multiple licenses to save
4. Bulk save to your account

#### License Actions

From the extension popup, you can:

- **Copy License Key**: Copy to clipboard
- **Open Redemption Page**: Navigate to license activation
- **Mark as Redeemed**: Update license status
- **View Details**: See full license information
- **activeTab**: Access to current tab for license extraction
- **notifications**: Browser notifications for license alerts





### Data Handling

- License keys are encrypted before transmission
- No sensitive data is stored locally
- All communication uses HTTPS
- Extension follows Chrome security best practices

### Privacy

- Only scans supported deal sites
- No tracking or analytics
- User data never shared with third parties
- Respects browser privacy settings
