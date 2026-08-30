# VS Code Extension Documentation

## Overview

The LicenseVault VS Code extension provides comprehensive license management capabilities directly within Visual Studio Code. It offers a tree view explorer for organizing licenses, quick action commands for common operations, and a full-featured webview dashboard for complete license management.

## Features

### 🌳 Tree View Explorer

Visual license organization with status indicators:

- **License Categories**: Group licenses by status (active, expired, expiring soon)
- **Status Indicators**: Color-coded icons for license states
- **Quick Actions**: Right-click context menus for copy, edit, delete operations
- **Search Integration**: Filter licenses by name, product, or status

### ⚡ Quick Actions & Commands

Command palette integration for rapid license management:

- **Add License** (`LicenseVault: Add License`): Quick license entry form
- **Edit License** (`LicenseVault: Edit License`): Modify existing licenses
- **Delete License** (`LicenseVault: Delete License`): Remove licenses with confirmation
- **Search Licenses** (`LicenseVault: Search Licenses`): Find licenses by keyword
- **Login/Logout** (`LicenseVault: Login`/`LicenseVault: Logout`): Authentication management

### 🖥️ Webview Dashboard

Full-featured license management interface:

- **Complete CRUD Operations**: Create, read, update, delete licenses
- **Bulk Operations**: Select multiple licenses for batch actions
- **Advanced Search**: Filter by multiple criteria
- **License Details**: Comprehensive license information display
- **Export Functionality**: Export licenses to CSV format

### 🔄 Synchronization

Real-time synchronization with LicenseVault backend:

- **Auto-sync**: Automatic background synchronization
- **Manual Refresh**: Force sync with server
- **Conflict Resolution**: Handle sync conflicts gracefully
- **Offline Support**: Queue operations for when connection is restored

### 🔐 Authentication

Secure authentication integration:

- **OAuth Flow**: Secure login through LicenseVault
- **Token Management**: Automatic token refresh and storage
- **Session Persistence**: Remember login state across VS Code sessions

## Installation

### From VS Code Marketplace

1. Open VS Code
2. Go to Extensions (`Ctrl+Shift+X` / `Cmd+Shift+X`)
3. Search for "LicenseVault"
4. Click "Install"

### From Source (Development)

1. Clone the repository
2. Open the `vscode-extension` folder in VS Code
3. Run `npm install` to install dependencies
4. Press `F5` to launch extension development host
5. Test the extension in the new window

### Requirements

- **VS Code**: Version 1.74.0 or higher
- **Node.js**: Version 16.x or higher (for development)
- **LicenseVault Backend**: Running instance accessible via HTTP/HTTPS

## Configuration

### Extension Settings

Access settings through VS Code settings (`Ctrl+,` / `Cmd+,`):

#### API Configuration
- **API Base URL**: `http://localhost:3001` for development, or your production URL
- **Timeout**: Request timeout in milliseconds (default: 30000)
- **Retry Attempts**: Number of retry attempts for failed requests (default: 3)

#### Synchronization
- **Auto Sync**: Enable/disable automatic background synchronization (default: true)
- **Sync Interval**: How often to sync in minutes (default: 30)
- **Sync on Startup**: Sync licenses when VS Code starts (default: true)

#### UI Preferences
- **Tree View Icons**: Show/hide status icons in tree view (default: true)
- **Notifications**: Show notifications for sync events (default: true)
- **Confirm Deletions**: Require confirmation before deleting licenses (default: true)

### Authentication Setup

1. **Install Extension**: Follow installation steps above
2. **Open Command Palette**: `Ctrl+Shift+P` / `Cmd+Shift+P`
3. **Run Login Command**: Type "LicenseVault: Login" and select it
4. **Complete OAuth Flow**: Browser will open for authentication
5. **Verify Connection**: Check tree view for loaded licenses

## Usage

### Basic Operations

#### Adding a License

1. **Command Palette**: `Ctrl+Shift+P` → "LicenseVault: Add License"
2. **Fill Form**: Enter license details (product, key, expiry, etc.)
3. **Save**: License is added and synced to server

#### Editing a License

1. **Tree View**: Right-click license → "Edit License"
2. **Or Command**: `Ctrl+Shift+P` → "LicenseVault: Edit License" → Select license
3. **Modify**: Update license information
4. **Save**: Changes are synced to server

#### Deleting a License

1. **Tree View**: Right-click license → "Delete License"
2. **Or Command**: `Ctrl+Shift+P` → "LicenseVault: Delete License" → Select license
3. **Confirm**: Confirm deletion (if enabled in settings)

#### Searching Licenses

1. **Command**: `Ctrl+Shift+P` → "LicenseVault: Search Licenses"
2. **Enter Query**: Type search terms
3. **Results**: Matching licenses displayed in quick pick menu

### Advanced Features

#### Webview Dashboard

1. **Open Dashboard**: Tree view header → "Open Dashboard" button
2. **Full Management**: Complete license CRUD operations
3. **Bulk Actions**: Select multiple licenses for batch operations
4. **Export**: Export selected licenses to CSV

#### Bulk Operations

In the webview dashboard:
1. **Select Licenses**: Check boxes next to licenses
2. **Choose Action**: Delete selected, export selected
3. **Confirm**: Execute bulk operation

### Tree View Navigation

- **Expand/Collapse**: Click arrows or use keyboard navigation
- **Context Menu**: Right-click for available actions
- **Status Filtering**: Categories show licenses by status
- **Refresh**: Click refresh button to sync with server

## Development

### Project Structure

```
vscode-extension/
├── src/
│   ├── extension.ts           # Main extension entry point
│   ├── tree/
│   │   ├── LicenseTreeProvider.ts    # Tree view data provider
│   │   └── LicenseTreeItem.ts        # Tree item implementation
│   ├── commands/
│   │   ├── CommandHandler.ts         # Command registration
│   │   └── handlers/                 # Individual command handlers
│   ├── services/
│   │   ├── LicenseVaultService.ts    # API communication
│   │   └── AuthService.ts            # Authentication handling
│   ├── webview/
│   │   ├── DashboardWebview.ts       # Webview management
│   │   └── html/                     # Webview HTML templates
│   └── utils/
│       └── helpers.ts                # Utility functions
├── package.json               # Extension manifest
├── tsconfig.json              # TypeScript configuration
└── webpack.config.js          # Build configuration
```

### Building & Testing

#### Development Setup

1. **Prerequisites**
   ```bash
   npm install -g @vscode/vsce  # Extension packaging tool
   npm install
   ```

2. **Development**
   ```bash
   npm run watch    # Watch mode for development
   npm run compile  # One-time compilation
   ```

3. **Testing**
   ```bash
   npm run test     # Run unit tests
   npm run test:e2e # Run end-to-end tests (if configured)
   ```

4. **Packaging**
   ```bash
   npm run package  # Create .vsix package
   vsce package     # Alternative packaging
   ```

#### Testing the Extension

1. **Launch Development Host**: Press `F5` in VS Code
2. **Test Commands**: Use command palette to test all commands
3. **Test Tree View**: Verify license loading and display
4. **Test Webview**: Open dashboard and test all features
5. **Test Authentication**: Login/logout flow

### API Integration

The extension communicates with the LicenseVault backend via REST API:

- **Base URL**: Configurable in extension settings
- **Authentication**: JWT tokens with automatic refresh
- **Endpoints**: Standard CRUD operations for licenses
- **Error Handling**: Graceful handling of network errors and API failures

### Extension Points

#### Commands
- `licensevault.addLicense`: Add new license
- `licensevault.editLicense`: Edit existing license
- `licensevault.deleteLicense`: Delete license
- `licensevault.searchLicenses`: Search licenses
- `licensevault.login`: Authenticate user
- `licensevault.logout`: Sign out user
- `licensevault.refresh`: Sync with server
- `licensevault.openDashboard`: Open webview dashboard

#### Views
- `licensevault.tree`: Main tree view for license organization

#### Configuration
- `licensevault.api.baseUrl`: API base URL
- `licensevault.api.timeout`: Request timeout
- `licensevault.sync.autoSync`: Enable auto-sync
- `licensevault.sync.interval`: Sync interval in minutes
- `licensevault.ui.showIcons`: Show status icons

## Troubleshooting

### Common Issues

#### Extension Not Loading

**Symptoms**: Extension doesn't appear in VS Code

**Solutions**:
- Reload VS Code window (`Ctrl+Shift+P` → "Developer: Reload Window")
- Check VS Code version (minimum 1.74.0)
- Verify extension is enabled in Extensions panel
- Check VS Code developer console for errors

#### Authentication Issues

**Symptoms**: Cannot login or sync fails

**Solutions**:
- Verify API base URL in settings
- Check backend server is running
- Clear authentication tokens (`LicenseVault: Logout`)
- Check network connectivity
- Verify OAuth configuration

#### Tree View Empty

**Symptoms**: No licenses shown in tree view

**Solutions**:
- Try manual refresh (tree view refresh button)
- Check authentication status
- Verify backend has licenses for user
- Check VS Code developer console for errors

#### Webview Not Loading

**Symptoms**: Dashboard doesn't open or shows blank

**Solutions**:
- Reload VS Code window
- Disable other extensions temporarily
- Check VS Code developer console
- Verify webview security settings

#### Sync Errors

**Symptoms**: Licenses not syncing or errors on sync

**Solutions**:
- Check internet connection
- Verify API endpoint accessibility
- Check backend server logs
- Try manual sync command
- Clear extension cache if available

### Debug Mode

Enable debug logging:
1. Open VS Code settings
2. Search for "LicenseVault"
3. Enable "Debug Logging" if available
4. Check VS Code developer console for logs

### Logs and Diagnostics

- **VS Code Developer Console**: `Help` → `Toggle Developer Tools`
- **Extension Logs**: Check VS Code output panel → "LicenseVault"
- **Network Logs**: Use browser dev tools for OAuth flows

## Security

### Data Handling

- **Token Storage**: Secure storage using VS Code secrets API
- **Encryption**: License keys encrypted in transit and at rest
- **No Plaintext Storage**: Sensitive data never stored in plaintext
- **HTTPS Only**: All API communication over secure connections

### Privacy

- **No Telemetry**: No usage data collected or transmitted
- **Local Processing**: License operations processed locally when possible
- **User Consent**: All data sharing requires explicit user consent
- **Data Minimization**: Only necessary data collected and stored

## Performance

### Optimization Features

- **Lazy Loading**: Tree view loads data on demand
- **Caching**: API responses cached to reduce requests
- **Background Sync**: Non-blocking synchronization
- **Debounced Search**: Search input debounced to reduce API calls

### Resource Usage

- **Memory**: Minimal memory footprint (< 50MB typical usage)
- **CPU**: Low CPU usage during normal operation
- **Network**: Efficient API usage with request batching
- **Storage**: Small local storage for settings and cache

## Contributing

### Development Workflow

1. **Fork Repository**: Create fork on GitHub
2. **Clone Fork**: `git clone https://github.com/yourusername/licensevault-vscode.git`
3. **Create Branch**: `git checkout -b feature/your-feature-name`
4. **Install Dependencies**: `npm install`
5. **Make Changes**: Implement your feature or fix
6. **Run Tests**: `npm test`
7. **Test Extension**: Press `F5` to test in development host
8. **Commit Changes**: `git commit -m "Description of changes"`
9. **Push Branch**: `git push origin feature/your-feature-name`
10. **Create PR**: Open pull request on GitHub

### Code Standards

- **TypeScript**: Strict mode enabled, no `any` types
- **ESLint**: Follow configured linting rules
- **Prettier**: Code formatted with Prettier
- **Testing**: Unit tests for all new features
- **Documentation**: Update docs for new features

### Testing Guidelines

- **Unit Tests**: Test individual functions and classes
- **Integration Tests**: Test API integration
- **E2E Tests**: Test complete user workflows
- **Manual Testing**: Test in development host before PR

## Changelog

### Version 1.0.0
- ✅ Complete VS Code extension with all core features
- ✅ Tree view explorer with status indicators
- ✅ Full command palette integration
- ✅ Webview dashboard for comprehensive management
- ✅ OAuth authentication with secure token storage
- ✅ Real-time synchronization with backend
- ✅ Bulk operations and advanced search
- ✅ CSV export functionality
- ✅ Comprehensive documentation and troubleshooting

## Support

### Getting Help

1. **Check Documentation**: Review this documentation first
2. **Search Issues**: Check existing GitHub issues
3. **Create Issue**: Open new issue with detailed information
4. **Community**: Join discussions in GitHub discussions

### Issue Reporting

When reporting issues, please include:

- **VS Code Version**: Help → About
- **Extension Version**: Extensions panel → LicenseVault
- **OS and Version**: Windows/macOS/Linux with version
- **Steps to Reproduce**: Detailed reproduction steps
- **Expected vs Actual**: What you expected vs what happened
- **Logs**: Any relevant error messages or logs
- **Screenshots**: If applicable, screenshots of the issue

### Feature Requests

Feature requests are welcome! Please:

- Check if feature already exists or is planned
- Describe the use case and benefits
- Provide mockups or examples if possible
- Consider implementation complexity

## License

This extension is part of the LicenseVault project and follows the same licensing terms.

- Right-click on a license
- Select "Copy License Key"
- Or use keyboard shortcut when license is selected

#### Updating License Status

- Right-click on a license
- Select "Mark as Redeemed" or "Mark as Expired"
- Status updates sync automatically

#### Adding Manual Licenses

- Use Command Palette: "LicenseVault: Add License"
- Fill in license details
- Save to your vault

### Commands

All available commands (accessible via `Ctrl+Shift+P`):

- `LicenseVault: Login` - Authenticate with your account
- `LicenseVault: Logout` - Sign out of your account
- `LicenseVault: Open Dashboard` - Open the license dashboard
- `LicenseVault: Add License` - Manually add a license
- `LicenseVault: Refresh Licenses` - Sync latest license data
- `LicenseVault: Settings` - Open extension settings

## Configuration

### Extension Settings

Access through VS Code settings (`Ctrl+,`) and search for "LicenseVault":

- **Server URL**: LicenseVault API server address
- **Auto Refresh**: Automatically refresh license data
- **Refresh Interval**: How often to sync (in minutes)
- **Show Status Bar**: Display license count in status bar
- **Notification Settings**: Configure alerts and notifications

### Workspace Settings

Project-specific settings:

```json
{
  "licensevault.serverUrl": "http://localhost:3001",
  "licensevault.autoRefresh": true,
  "licensevault.refreshInterval": 30
}
```

## Supported Sites

The extension integrates with licenses from:

- **AppSumo**: Full OAuth integration
- **Product Hunt**: OAuth and API access
- **StackSocial**: Credential-based access
- **Humble Bundle**: Account integration

## Troubleshooting

### Extension Not Loading

**Problem**: LicenseVault doesn't appear in the sidebar

**Solutions**:
- Verify extension is installed and enabled
- Reload VS Code window (`Ctrl+Shift+P` → "Developer: Reload Window")
- Check VS Code developer console for errors

### Cannot Login

**Problem**: Authentication fails

**Solutions**:
- Verify server URL in settings
- Check internet connection
- Ensure backend server is running
- Try logging out and back in

### Licenses Not Syncing

**Problem**: License data doesn't update

**Solutions**:
- Use "LicenseVault: Refresh Licenses" command
- Check server connectivity
- Verify account permissions
- Check VS Code output panel for errors

### Performance Issues

**Problem**: Extension slows down VS Code

**Solutions**:
- Disable auto-refresh in settings
- Increase refresh interval
- Limit number of displayed licenses
- Clear extension cache

## Development

### Project Structure

```
vscode-extension/
├── src/
│   ├── extension.ts       # Main extension entry point
│   ├── providers/
│   │   └── treeProvider.ts # Tree view data provider
│   ├── services/
│   │   └── apiService.ts   # API communication
│   └── webviews/
│       └── dashboard.ts    # Dashboard webview
├── out/                   # Compiled JavaScript
├── package.json          # Extension manifest
└── tsconfig.json         # TypeScript configuration
```

### Building and Testing

1. **Install dependencies**:

   ```bash
   npm install
   ```

2. **Compile TypeScript**:

   ```bash
   npm run compile
   ```

3. **Run tests**:

   ```bash
   npm test
   ```

4. **Debug extension**:
   - Press `F5` in VS Code
   - Select "Extension Development Host"
   - Test in new window

### Key Files

- **extension.ts**: Main extension activation and command registration
- **treeProvider.ts**: Tree view data structure and interactions
- **apiService.ts**: HTTP client for LicenseVault API
- **dashboard.ts**: Webview panel for the license dashboard

## API Integration

The extension communicates with the LicenseVault API:

- **Authentication**: JWT token management
- **License CRUD**: Create, read, update, delete operations
- **Sync Operations**: Real-time data synchronization
- **Settings Management**: User preference storage

## Security

### Data Handling

- License keys encrypted in transit and at rest
- JWT tokens stored securely in VS Code's secret storage
- No sensitive data logged or exposed
- HTTPS-only communication

### Permissions

The extension requires:

- **Network access**: Communicate with LicenseVault API
- **File system**: Read/write extension settings
- **UI access**: Create webviews and tree views

## Changelog

### Version 1.0.0

- Initial release
- Tree view license explorer
- Dashboard webview interface
- Command palette integration
- API synchronization
- Multi-site license support

## Contributing

To contribute to the VS Code extension:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/new-feature`)
3. Make your changes
4. Test thoroughly in extension development host
5. Run tests (`npm test`)
6. Submit a pull request

### Development Guidelines

- Follow TypeScript best practices
- Use async/await for API calls
- Handle errors gracefully
- Update documentation for new features
- Test on multiple VS Code versions

## Support

For extension support:

1. Check the troubleshooting section
2. Review VS Code developer console
3. Check extension output channel
4. Open an issue with detailed reproduction steps

## License

This extension is part of the LicenseVault project and follows the same MIT license terms.
