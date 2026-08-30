# Lifetime License Manager (LicenseVault) + Eduba Code Vault

A comprehensive, cross-platform lifetime software license management system integrated with **Eduba Code Vault** - a sovereign, local-first code repository system. The complete 2026 Sovereign Solo-Developer Pipeline from intake to dissemination.

## 🚀 Features

### Core Features

- **Multi-Platform License Detection**: Automatically detects licenses on major deal sites
- **Secure Storage**: Encrypted license key storage with master password protection
- **Cross-Platform Access**: Web interface, browser extension, and VS Code integration
- **Real-time Sync**: Automatic synchronization across all platforms
- **Action Management**: Track license redemptions, renewals, and expirations
- **Modern UI**: Clean, responsive interface with dark theme support
- **Local-First**: No external dependencies, runs completely offline

### Eduba Code Vault Features

- **Sovereign Code Repository**: Local-first version control replacing traditional Git
- **Cryptographic Integrity**: SHA-3-256 hashing with Forge Manifests for tamper-proof commits
- **Honey Encryption Defense**: Active defense against unauthorized access attempts
- **Artifact Sealing**: Production-ready code compilation with Genesis Seal v1.4
- **Semantic Search**: Hyperdimensional Context Web for intelligent code discovery
- **Peer-to-Peer Sync**: Decentralized repository synchronization
- **Zero External Dependencies**: Complete offline operation with air-gapped security

### Browser Extension Features

- **Automatic License Scraping**: Content scripts for AppSumo, ProductHunt, StackSocial, and Humble Bundle
- **Smart License Detection**: Detects licenses on software websites and suggests autofill
- **Manual License Addition**: Right-click context menu to add licenses from any page
- **OAuth Integration**: Seamless authentication with the main application
- **Background Sync**: Automatic periodic license synchronization
- **Popup Dashboard**: Quick access to recent licenses and sync controls

### VS Code Extension Features

- **Tree View Explorer**: Hierarchical license organization by status and source
- **Command Palette Integration**: Quick actions for all license operations
- **Webview Dashboard**: Full-featured license management interface
- **Status Bar Integration**: License counts and alerts
- **Bulk Operations**: Manage multiple licenses simultaneously
- **Search & Filter**: Advanced license search and filtering capabilities
- **Eduba Integration**: Direct access to sovereign code repositories

## 🏗️ Architecture

The application consists of five main components:

### Backend (Node.js/Express)

- REST API server with SQLite3 database
- JWT authentication system with Google OAuth
- License management endpoints with full CRUD operations
- Site connection management for scraping
- Notification system with email/browser notifications
- CSV export functionality for license backups
- **Eduba Services**: Scribe (version control), Kiln (artifact sealing), Labyrinth (active defense)

### Frontend (React/Vite)

- Modern React application with TypeScript
- Responsive UI with Tailwind CSS and dark theme
- Real-time data synchronization with TanStack Query
- Authentication flows with OAuth callback handling
- License dashboard with statistics and quick actions
- Individual license detail pages with editing capabilities
- Bulk operations for multiple license management
- **Eduba Library Component**: Sovereign repository management interface

### Eduba Code Vault

- **Scribe Service**: Version control engine with SHA-3-256 hashing
- **Kiln Service**: Artifact compilation and Genesis Seal v1.4 protection
- **Labyrinth Service**: Honey Encryption for active defense
- **Semantic Search**: Hyperdimensional Context Web indexing
- **P2P Sync**: Decentralized repository synchronization
- **Forge Manifests**: Cryptographic integrity verification

### Browser Extension (Chrome Manifest V3)

- Content scripts for automatic license extraction
- Background service worker for sync and notifications
- Popup interface for quick access and controls
- Options page for settings and site management
- Context menu integration for manual license addition
- OAuth authentication flow integration

### VS Code Extension (TypeScript)

- Tree data provider for license organization
- Command system for all operations
- Webview dashboard with full management interface
- Service layer for API communication
- Configuration management and settings
- Status bar and notification integration
- **Eduba Repository Explorer**: Direct sovereign code management

## 📋 Prerequisites

- Node.js 18+ and npm
- SQLite3
- Chrome/Edge browser (for extension)
- VS Code (for VS Code extension)
- Ollama (for AI features, optional)

## 🛠️ Installation & Setup

### Quick Start (Development)

```bash
git clone <repository-url>
cd lifetime-license-manager

# Backend setup
cd backend
npm install
cp .env.example .env
npm start

# Frontend setup (new terminal)
cd ../frontend
npm install
npm run dev

# Browser extension setup
# Load browser-extension folder in Chrome developer mode

# VS Code extension setup
cd ../vscode-extension
npm install
npm run compile
```

### Production Deployment

#### Automated Setup (Recommended)

```bash
# Run the production setup script
sudo ./scripts/setup-production.sh
```

#### Manual Setup

1. **Server Setup**

```bash
# Install dependencies
sudo ./scripts/deploy-vps.sh

# Configure environment
cp .env.production backend/.env
# Edit with production values
```

2. **Frontend Deployment**

```bash
# Deploy to web space
./scripts/deploy-webspace.sh
```

3. **SSL Configuration**

```bash
# Install certbot for Let's Encrypt
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d yourdomain.com
```

## 🧪 Testing

The repository now includes a layered test suite for every shipped surface:

- **Main app backend**: Vitest + Supertest contract tests for auth, license routes, and browser-facing CORS behavior
- **Main app frontend**: Vitest + React Testing Library component tests for auth gates, login/register flows, dashboard behavior, and key UI actions
- **Main app end-to-end**: Playwright route-level coverage for the major pages, dashboards, navigation, and high-value buttons/features
- **Browser extension**: Vitest + jsdom tests for extractors, popup flows, and options behavior with mocked Chrome APIs
- **VS Code extension**: Vitest unit tests for service/provider behavior with backend-accurate response shapes
- **LtLMA**: Vitest + Testing Library smoke coverage for the page-level add-license flow

### Run everything

```bash
npm install
npm test
```

### Run individual suites

```bash
# Main app
npm --prefix LtLM/backend test
npm --prefix LtLM/frontend test
npm run test:e2e

# Extensions and alternate app
npm --prefix LtLM/frontend/browser-extension test
npm --prefix LtLM/frontend/vscode-extension run test:unit
npm --prefix LtLMA test
```

## 🎯 Usage

### Web Interface

1. Open `http://localhost:5175` (dev) or your production domain
2. Register a new account or login with Google OAuth
3. Connect to deal sites (AppSumo, Product Hunt, etc.)
4. View your license dashboard
5. Manage licenses and track actions
6. **Access Eduba**: Navigate to Code Vault section for sovereign repository management

### Eduba Code Vault

#### Creating a Repository

```javascript
// Via API
POST /api/eduba/repositories
{
  "name": "my-project",
  "description": "Sovereign project repository"
}
```

#### Making Commits

```javascript
POST /api/eduba/repositories/{id}/commits
{
  "message": "Initial sovereign commit",
  "files": [...],
  "author": "developer"
}
```

#### Semantic Search

```javascript
GET /api/eduba/search?q=function+calculateTotal&repository=123
```

### Browser Extension

1. Visit supported deal sites (appsumo.com, producthunt.com, etc.)
2. The extension will automatically detect available licenses
3. Click the extension icon to view detected licenses
4. Save licenses to your vault

### VS Code Extension

1. Open VS Code with the extension installed
2. Use Command Palette: `Ctrl+Shift+P`
3. Search for "LicenseVault" commands:
   - `LicenseVault: Login` - Authenticate with your account
   - `LicenseVault: Dashboard` - Open license dashboard
   - `LicenseVault: Add License` - Manually add a license
   - `Eduba: Create Repository` - Start sovereign code management
   - `Eduba: Semantic Search` - Find code across repositories

## 🔧 Development

### Project Structure

```
lifetime-license-manager/
├── backend/                 # Node.js/Express API server
│   ├── database.js         # SQLite database setup
│   ├── routes/             # API route handlers
│   ├── services/           # Business logic + Eduba services
│   │   ├── eduba-scribe.service.js     # Version control
│   │   ├── eduba-kiln.service.js       # Artifact sealing
│   │   └── eduba-labyrinth.service.js  # Active defense
│   └── server.js           # Main server file
├── frontend/               # React/Vite web application
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── hooks/         # Custom React hooks
│   │   └── pages/         # Page components
│   └── public/            # Static assets
├── browser-extension/      # Chrome extension
├── vscode-extension/       # VS Code extension
├── scripts/                # Deployment and setup scripts
│   ├── setup-production.sh # Automated production setup
│   ├── deploy-vps.sh      # VPS deployment
│   └── deploy-webspace.sh # Frontend deployment
├── docs/                   # Documentation
└── Storage/               # Cloud storage integrations
    ├── Koofr/
    ├── IceDrive/
    └── Degoo/
```

### Running Tests

```bash
# Backend tests
cd backend && npm test

# Frontend tests
cd frontend && npm test

# VS Code extension tests
cd vscode-extension && npm test
```

## 🔒 Security

- **License Encryption**: AES-256-GCM encryption for all stored licenses
- **JWT Authentication**: Secure token-based authentication
- **Honey Encryption**: Active defense against brute-force attacks (Eduba)
- **Forge Manifests**: Cryptographic integrity verification (Eduba)
- **Genesis Seals**: Tamper-proof artifact protection (Eduba)
- **HTTPS Required**: SSL/TLS encryption for production deployment
- **Zero External Dependencies**: Complete offline operation capability

## 📊 Monitoring & Maintenance

### Health Checks

```bash
# Application health
curl http://localhost:3001/api/health

# PM2 process status
pm2 status

# System monitoring
htop
```

### Backup & Recovery

```bash
# Automated backup
./scripts/backup.sh

# Database integrity check
sqlite3 data/app.db "PRAGMA integrity_check;"

# Eduba repository export
GET /api/eduba/repositories/{id}/export
```

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Make your changes
4. Add tests for new functionality
5. Commit your changes (`git commit -m 'Add amazing feature'`)
6. Push to the branch (`git push origin feature/amazing-feature`)
7. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Troubleshooting

### Common Issues

**Backend won't start:**

- Check if port 3001 is available: `netstat -tlnp | grep 3001`
- Verify SQLite3 installation: `sqlite3 --version`
- Check .env configuration and database permissions

**Frontend build fails:**

- Ensure Node.js version is 18+: `node --version`
- Clear node_modules and reinstall: `rm -rf node_modules && npm install`
- Check for missing dependencies

**Browser extension not loading:**

- Verify manifest.json syntax
- Check browser developer mode is enabled
- Ensure correct folder path when loading unpacked

**VS Code extension not working:**

- Verify TypeScript compilation: `npm run compile`
- Check VS Code version compatibility
- Review extension logs in VS Code developer console

**Eduba features not working:**

- Ensure database schema is updated
- Check cryptographic dependencies (crypto, bcrypt)
- Verify Ollama installation for AI features

**Production deployment issues:**

- Check nginx configuration: `sudo nginx -t`
- Verify PM2 processes: `pm2 list`
- Review application logs: `pm2 logs licensevault-api`

## 📚 API Documentation

See [API Documentation](docs/API.md) for complete endpoint reference.

## 🎯 Roadmap

- [x] License detection and management
- [x] Cross-platform synchronization
- [x] Browser extension integration
- [x] VS Code extension integration
- [x] Eduba Code Vault implementation
- [x] Sovereign repository management
- [x] Production deployment automation
- [ ] Advanced AI code analysis
- [ ] Multi-language artifact compilation
- [ ] Enhanced P2P synchronization
- [ ] Mobile application support

---

**Built with ❤️ for the sovereign developer community**

## 🚀 Features

### Core Features

- **Multi-Platform License Detection**: Automatically detects licenses on major deal sites
- **Secure Storage**: Encrypted license key storage with master password protection
- **Cross-Platform Access**: Web interface, browser extension, and VS Code integration
- **Real-time Sync**: Automatic synchronization across all platforms
- **Action Management**: Track license redemptions, renewals, and expirations
- **Modern UI**: Clean, responsive interface with dark theme support
- **Local-First**: No external dependencies, runs completely offline

### Browser Extension Features

- **Automatic License Scraping**: Content scripts for AppSumo, ProductHunt, StackSocial, and Humble Bundle
- **Smart License Detection**: Detects licenses on software websites and suggests autofill
- **Manual License Addition**: Right-click context menu to add licenses from any page
- **OAuth Integration**: Seamless authentication with the main application
- **Background Sync**: Automatic periodic license synchronization
- **Popup Dashboard**: Quick access to recent licenses and sync controls

### VS Code Extension Features

- **Tree View Explorer**: Hierarchical license organization by status and source
- **Command Palette Integration**: Quick actions for all license operations
- **Webview Dashboard**: Full-featured license management interface
- **Status Bar Integration**: License counts and alerts
- **Bulk Operations**: Manage multiple licenses simultaneously
- **Search & Filter**: Advanced license search and filtering capabilities

## 🏗️ Architecture

The application consists of four main components:

### Backend (Node.js/Express)

- REST API server with SQLite3 database
- JWT authentication system with Google OAuth
- License management endpoints with full CRUD operations
- Site connection management for scraping
- Notification system with email/browser notifications
- CSV export functionality for license backups

### Frontend (React/Vite)

- Modern React application with TypeScript
- Responsive UI with Tailwind CSS and dark theme
- Real-time data synchronization with TanStack Query
- Authentication flows with OAuth callback handling
- License dashboard with statistics and quick actions
- Individual license detail pages with editing capabilities
- Bulk operations for multiple license management

### Browser Extension (Chrome Manifest V3)

- Content scripts for automatic license extraction
- Background service worker for sync and notifications
- Popup interface for quick access and controls
- Options page for settings and site management
- Context menu integration for manual license addition
- OAuth authentication flow integration

### VS Code Extension (TypeScript)

- Tree data provider for license organization
- Command system for all operations
- Webview dashboard with full management interface
- Service layer for API communication
- Configuration management and settings
- Status bar and notification integration

## 📋 Prerequisites

- Node.js 18+ and npm
- SQLite3
- Chrome/Edge browser (for extension)
- VS Code (for VS Code extension)

## 🛠️ Installation & Setup

### 1. Clone the Repository

```bash
git clone <repository-url>
cd lifetime-license-manager
```

### 2. Backend Setup

```bash
cd backend
npm install
cp .env.example .env
# Edit .env with your configuration
npm start
```

The backend will start on `http://localhost:3001`

### 3. Frontend Setup

```bash
cd frontend
npm install
npm run dev
```

The frontend will start on `http://localhost:5175`

### 4. Browser Extension Setup

1. Open Chrome/Edge browser
2. Navigate to `chrome://extensions/` or `edge://extensions/`
3. Enable "Developer mode"
4. Click "Load unpacked"
5. Select the `browser-extension` folder

### 5. VS Code Extension Setup

```bash
cd vscode-extension
npm install
npm run compile
# Package the extension
npm install -g @vscode/vsce
vsce package
```

Then install the generated `.vsix` file in VS Code.

## 🎯 Usage

### Web Interface

1. Open `http://localhost:5175` in your browser
2. Register a new account or login
3. Connect to deal sites (AppSumo, Product Hunt, etc.)
4. View your license dashboard
5. Manage licenses and track actions

### Browser Extension

1. Visit supported deal sites (appsumo.com, producthunt.com, etc.)
2. The extension will automatically detect available licenses
3. Click the extension icon to view detected licenses
4. Save licenses to your vault

### VS Code Extension

1. Open VS Code with the extension installed
2. Use Command Palette: `Ctrl+Shift+P`
3. Search for "LicenseVault" commands:
   - `LicenseVault: Login` - Authenticate with your account
   - `LicenseVault: Dashboard` - Open license dashboard
   - `LicenseVault: Add License` - Manually add a license

## 📚 API Documentation

### Authentication Endpoints

#### POST /api/auth/register

Register a new user account.

**Request Body:**

```json
{
  "username": "string",
  "email": "string",
  "password": "string"
}
```

#### POST /api/auth/login

Authenticate user and return JWT token.

**Request Body:**

```json
{
  "email": "string",
  "password": "string"
}
```

### License Endpoints

#### GET /api/licenses

Get all licenses for authenticated user.

#### GET /api/licenses/stats

Get license statistics dashboard data.

#### PATCH /api/licenses/:id/action

Update license action status.

**Request Body:**

```json
{
  "action": "redeemed|renewed|expired"
}
```

## 🔧 Development

### Project Structure

```
lifetime-license-manager/
├── backend/                 # Node.js/Express API server
│   ├── database.js         # SQLite database setup
│   ├── routes/             # API route handlers
│   ├── services/           # Business logic
│   └── server.js           # Main server file
├── frontend/               # React/Vite web application
│   ├── src/
│   │   ├── components/     # React components
│   │   ├── hooks/         # Custom React hooks
│   │   └── pages/         # Page components
│   └── public/            # Static assets
├── browser-extension/      # Chrome extension
│   ├── manifest.json      # Extension manifest
│   ├── popup/             # Popup interface
│   ├── content/           # Content scripts
│   └── background/        # Background scripts
└── vscode-extension/       # VS Code extension
    ├── src/               # TypeScript source
    ├── out/               # Compiled JavaScript
    └── package.json       # Extension manifest
```

### Running Tests

```bash
# Backend tests
cd backend
npm test

# Frontend tests
cd frontend
npm test

# VS Code extension tests
cd vscode-extension
npm test
```

## 🔒 Security

- All license keys are encrypted before storage
- JWT tokens for API authentication
- HTTPS recommended for production deployment
- No external API dependencies

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests for new functionality
5. Submit a pull request

## 📄 License

This project is licensed under the MIT License - see the LICENSE file for details.

## 🆘 Troubleshooting

### Common Issues

**Backend won't start:**

- Check if port 3001 is available
- Verify SQLite3 installation
- Check .env configuration

**Frontend build fails:**

- Ensure Node.js version is 18+
- Clear node_modules and reinstall
- Check for JSX file extensions

**Browser extension not loading:**

- Verify manifest.json syntax
- Check browser developer mode
- Ensure correct folder path

**VS Code extension not working:**

- Verify extension is installed and enabled
- Check VS Code developer console for errors
- Ensure backend is running

### Support

For issues and questions:

- Check the troubleshooting guide above
- Review the API documentation
- Open an issue on GitHub

---

**LicenseVault** - Manage your software licenses with confidence.

- Backend API: `http://localhost:3001`

## Environment Configuration

Create a `.env` file in the backend directory:

```bash
# Database
DB_PATH=./licensevault.db

# JWT
JWT_SECRET=your-super-secret-jwt-key-min-32-chars
JWT_EXPIRY=30d

# Session
SESSION_SECRET=your-session-secret-key

# OAuth - Add your own credentials
APPSUMO_CLIENT_ID=your_appsumo_client_id
APPSUMO_CLIENT_SECRET=your_appsumo_client_secret

PRODUCTHUNT_CLIENT_ID=your_ph_client_id
PRODUCTHUNT_CLIENT_SECRET=your_ph_client_secret

# Email (for notifications)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@example.com
SMTP_PASS=your-app-password

# Encryption
ENCRYPTION_KEY=your-32-char-aes-key-here

# Frontend URL
FRONTEND_URL=http://localhost:5173
```

## Security Features

- **End-to-End Encryption**: License keys and credentials encrypted with AES-256
- **JWT Authentication**: Secure token-based authentication
- **Helmet Security Headers**: Protection against common web vulnerabilities
- **CORS Configuration**: Restricted cross-origin requests
- **Input Validation**: Comprehensive validation on all endpoints

## Supported Sites

| Site          | Authentication | Scraping Method         |
| ------------- | -------------- | ----------------------- |
| AppSumo       | OAuth 2.0      | API + Scraping fallback |
| Product Hunt  | OAuth 2.0      | API + Scraping fallback |
| StackSocial   | Credentials    | Playwright scraping     |
| Humble Bundle | Credentials    | Playwright scraping     |

## API Endpoints

### Authentication

- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/auth/:site/connect` - OAuth initiation
- `GET /api/auth/:site/callback` - OAuth callback

### Licenses

- `GET /api/licenses` - Get user licenses
- `GET /api/licenses/stats` - Get license statistics
- `GET /api/licenses/:id` - Get specific license
- `PATCH /api/licenses/:id/action` - Update license action
- `PATCH /api/licenses/:id/action/complete` - Mark action complete

### Sites

- `GET /api/sites/connections` - Get connected sites
- `POST /api/sites/:site/connect` - Connect site with credentials
- `POST /api/sites/:site/sync` - Sync site licenses
- `DELETE /api/sites/:site` - Disconnect site

### Reminders

- `GET /api/reminders` - Get user reminders
- `POST /api/reminders` - Create reminder
- `PATCH /api/reminders/settings` - Update reminder settings
- `GET /api/reminders/settings` - Get reminder settings

## Development

### Adding New Sites

1. Add site configuration to `scraper_configs` table
2. Create site-specific bridge in `backend/bridges/`
3. Update `GenericScraper` with site-specific selectors
4. Add OAuth strategy if available
5. Update frontend site list

### Extending Scrapers

The `GenericScraper` class provides a foundation for site-specific scraping:

```javascript
class CustomBridge extends GenericScraper {
  constructor() {
    super("customsite");
  }

  async scrapeLicenses(userId, credentials) {
    // Custom scraping logic
    return licenses;
  }
}
```

## License

This project is licensed under the MIT License - see the LICENSE file for details.

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## Browser Extension Details

A Chrome/Firefox extension that automatically detects and extracts license keys from deal sites.

### Browser Extension Installation

1. Open Chrome Extensions page (`chrome://extensions/`)
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `browser-extension/` folder

## VS Code Extension Details

Manage your licenses directly within Visual Studio Code.

### VS Code Extension Installation

1. Open VS Code
2. Go to Extensions (`Ctrl+Shift+X`)
3. Search for "LicenseVault" (once published)
4. Or load from source: `cd vscode-extension && npm install && npm run compile`

## Disclaimer

This tool is for personal license management only. Always comply with the terms of service of the sites you connect to. The developers are not responsible for any misuse of this software.
