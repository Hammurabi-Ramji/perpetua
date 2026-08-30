# Development Setup Guide

This guide covers setting up the development environment for the Lifetime License Manager (LicenseVault) application.

## Prerequisites

### System Requirements

- **Operating System**: Windows 10/11, macOS 10.15+, or Linux
- **Node.js**: Version 18.0 or higher
- **npm**: Version 8.0 or higher (comes with Node.js)
- **SQLite3**: Version 3.35 or higher
- **Git**: For version control

### Development Tools

- **Visual Studio Code**: Recommended IDE
- **Chrome/Edge Browser**: For extension testing
- **Postman/Insomnia**: For API testing (optional)

## Project Structure

```
lifetime-license-manager/
├── backend/                 # Node.js/Express API server
├── frontend/               # React/Vite web application
├── browser-extension/      # Chrome extension
├── vscode-extension/       # VS Code extension
├── docs/                   # Documentation
└── README.md              # Main project documentation
```

## Backend Setup

### 1. Install Dependencies

```bash
cd backend
npm install
```

### 2. Environment Configuration

Create a `.env` file in the backend directory:

```bash
# Server Configuration
PORT=3001
NODE_ENV=development

# Database Configuration
DB_PATH=./data/app.db

# JWT Configuration
JWT_SECRET=your-super-secret-jwt-key-change-in-production
JWT_EXPIRES_IN=7d

# CORS Configuration
FRONTEND_URL=http://localhost:5175

# OAuth Configuration (for production)
APPSUMO_CLIENT_ID=your-appsumo-client-id
APPSUMO_CLIENT_SECRET=your-appsumo-client-secret
PRODUCTHUNT_CLIENT_ID=your-producthunt-client-id
PRODUCTHUNT_CLIENT_SECRET=your-producthunt-client-secret
```

### 3. Database Initialization

The database will be automatically created when the server starts. The schema includes:

- `users` - User accounts
- `licenses` - License records
- `connected_sites` - OAuth connections
- `reminders` - Notification schedules

### 4. Start Development Server

```bash
npm run dev
```

The backend will start on `http://localhost:3001`

## Frontend Setup

### 1. Install Dependencies

```bash
cd frontend
npm install
```

### 2. Environment Configuration

Create a `.env.local` file in the frontend directory:

```bash
# API Configuration
VITE_API_URL=http://localhost:3001/api

# Development Configuration
VITE_APP_ENV=development
```

### 3. Start Development Server

```bash
npm run dev
```

The frontend will start on `http://localhost:5175`

## Browser Extension Setup

### 1. Load Extension in Browser

#### Chrome/Edge

1. Open `chrome://extensions/` or `edge://extensions/`
2. Enable "Developer mode"
3. Click "Load unpacked"
4. Select the `browser-extension/` folder

#### Firefox

1. Open `about:debugging`
2. Click "Load Temporary Add-on"
3. Select `browser-extension/manifest.json`

### 2. Extension Development

- Make changes to extension files
- Reload the extension in browser
- Test functionality on supported sites

## VS Code Extension Setup

### 1. Install Dependencies

```bash
cd vscode-extension
npm install
```

### 2. Compile Extension

```bash
npm run compile
```

### 3. Debug Extension

1. Open the project in VS Code
2. Press `F5` to start debugging
3. Select "Extension Development Host"
4. Test in the new VS Code window

### 4. Package Extension (Optional)

```bash
# Install vsce globally
npm install -g @vscode/vsce

# Package extension
vsce package
```

## Full Development Workflow

### 1. Start All Services

Open multiple terminals and run:

```bash
# Terminal 1: Backend
cd backend && npm run dev

# Terminal 2: Frontend
cd frontend && npm run dev

# Terminal 3: VS Code Extension (if debugging)
cd vscode-extension && code --extensionDevelopmentPath=. --disable-extensions
```

### 2. Test the Application

1. **Web Interface**: Open `http://localhost:5175`
2. **API**: Test endpoints at `http://localhost:3001/api`
3. **Browser Extension**: Load in browser and test on deal sites
4. **VS Code Extension**: Test in extension development host

### 3. Development Commands

#### Backend
```bash
npm run dev      # Start development server with hot reload
npm start        # Start production server
npm test         # Run tests
npm run lint     # Run ESLint
```

#### Frontend
```bash
npm run dev      # Start development server
npm run build    # Build for production
npm run preview  # Preview production build
npm test         # Run tests
npm run lint     # Run ESLint
```

#### VS Code Extension
```bash
npm run compile  # Compile TypeScript
npm run watch    # Watch for changes
npm test         # Run tests
npm run lint     # Run ESLint
```

## Testing

### Unit Tests

```bash
# Backend tests
cd backend && npm test

# Frontend tests
cd frontend && npm test

# VS Code extension tests
cd vscode-extension && npm test
```

### Integration Testing

1. **API Testing**: Use Postman or curl to test endpoints
2. **UI Testing**: Manual testing of web interface
3. **Extension Testing**: Test on real deal sites

### End-to-End Testing

1. Register a new user account
2. Connect to deal sites
3. Add licenses manually
4. Test license management features
5. Verify data synchronization

## Debugging

### Backend Debugging

- Use `console.log()` for simple debugging
- Use VS Code debugger with launch configuration
- Check server logs in terminal
- Use Postman to test API endpoints

### Frontend Debugging

- Use browser developer tools
- React DevTools for component inspection
- Check browser console for errors
- Network tab for API calls

### Extension Debugging

#### Browser Extension

- Use browser developer tools on extension pages
- Check background script console
- Use `console.log()` in content scripts

#### VS Code Extension

- Use VS Code debugger in extension development host
- Check "Output" panel for extension logs
- Use "Developer: Toggle Developer Tools" for UI debugging

## Common Issues

### Port Conflicts

**Problem**: Port 3001 or 5175 already in use

**Solution**:
```bash
# Find process using port
netstat -ano | findstr :3001

# Kill process (Windows)
taskkill /PID <PID> /F

# Or change port in .env
PORT=3002
```

### Database Issues

**Problem**: Database file locked or corrupted

**Solution**:
```bash
# Delete database file (development only)
rm backend/data/app.db

# Restart server to recreate database
```

### Extension Not Loading

**Problem**: Browser/VS Code extension not working

**Solution**:
- Reload extension in browser
- Restart VS Code
- Check console for errors
- Verify manifest files

### Build Failures

**Problem**: Compilation errors

**Solution**:
```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install

# Clear cache
npm run clean  # if available
```

## Contributing

### Code Style

- Use ESLint and Prettier configurations
- Follow TypeScript best practices
- Use meaningful commit messages
- Write tests for new features

### Pull Request Process

1. Create a feature branch
2. Make your changes
3. Run tests and linting
4. Update documentation if needed
5. Submit pull request

### Documentation

- Update README for new features
- Add API documentation for new endpoints
- Update setup guides for configuration changes

## Deployment

### Development Deployment

For local testing with production-like setup:

```bash
# Backend
cd backend
npm run build
npm start

# Frontend
cd frontend
npm run build
npm run preview
```

### Production Deployment

See deployment documentation for production setup with proper security, databases, and scaling.

## Support

For development issues:

1. Check this guide first
2. Review error messages and logs
3. Check GitHub issues for similar problems
4. Open a new issue with detailed information

Happy coding! 🚀
