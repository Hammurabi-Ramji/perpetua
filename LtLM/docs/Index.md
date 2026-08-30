# LicenseVault - Complete Documentation Index

## Overview

LicenseVault is a comprehensive, cross-platform lifetime software license management system that automatically detects, stores, and manages software licenses from deal sites like AppSumo, Product Hunt, StackSocial, and Humble Bundle.

## Documentation Structure

### Core Documentation

- **[README.md](../README.md)** - LicenseVault overview; launch desktop product is Perpetua (`../../LtLMA/`)
- **[Development-Setup.md](Development-Setup.md)** - Complete development environment setup guide
- **[API.md](API.md)** - Comprehensive API documentation with endpoints and examples

### Component Documentation

- **[Browser-Extension.md](Browser-Extension.md)** - Browser extension installation, features, and troubleshooting
- **[VSCode-Extension.md](VSCode-Extension.md)** - VS Code extension setup, features, and development

## Quick Start

### For Users

1. **Install the Application**:

   ```bash
   git clone <repository-url>
   cd lifetime-license-manager
   ```

2. **Start Backend**:

   ```bash
   cd backend
   npm install
   npm start
   ```

3. **Start Frontend**:

   ```bash
   cd frontend
   npm install
   npm run dev
   ```

4. **Install Extensions**:
   - Load browser extension in Chrome/Edge
   - Install VS Code extension from .vsix file

### For Developers

See [Development-Setup.md](Development-Setup.md) for complete development environment setup.

## Architecture Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Web Frontend  │    │   Browser Ext   │    │   VS Code Ext   │
│   (React/Vite)  │    │   (Manifest V3) │    │   (TypeScript)   │
└─────────┬───────┘    └─────────┬───────┘    └─────────┬───────┘
          │                     │                      │
          └─────────────────────┼──────────────────────┘
                                │
                    ┌───────────┴───────────┐
                    │   REST API Backend    │
                    │   (Node.js/Express)   │
                    │                       │
                    │   ┌─────────────────┐ │
                    │   │   SQLite3 DB     │ │
                    │   │   (Encrypted)    │ │
                    │   └─────────────────┘ │
                    └───────────────────────┘
```

## Key Features

### 🔍 License Detection

- Automatic detection on AppSumo, Product Hunt, StackSocial, Humble Bundle
- Manual license entry
- Bulk import capabilities

### 🔐 Security

- AES-256-CBC field encryption for license keys (see `backend/utils/encryption.js`)
- JWT authentication
- Secure credential storage
- No external API dependencies

### 🔄 Synchronization

- Real-time sync across all platforms
- Offline-first architecture
- Conflict resolution
- Automatic backups

### 📊 Management

- License status tracking (active, expired, redeemed)
- Action management (renew, redeem, transfer)
- Reminder system
- Statistics dashboard

## Supported Platforms

| Component | Technology | Status |
|-----------|------------|--------|
| Backend API | Node.js/Express | ✅ Complete |
| Web Frontend | React/Vite | ✅ Complete |
| Browser Extension | Chrome Manifest V3 | ✅ Complete |
| VS Code Extension | TypeScript | ✅ Complete |
| Database | SQLite3 | ✅ Complete |

## API Endpoints Summary

### Authentication

- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User authentication

### Licenses

- `GET /api/licenses` - Get user licenses
- `GET /api/licenses/stats` - Get statistics
- `PATCH /api/licenses/:id/action` - Update license status

### Sites

- `GET /api/sites/connections` - Get connected sites
- `POST /api/sites/:site/connect` - Connect to site

### Reminders

- `GET /api/reminders` - Get reminders
- `POST /api/reminders` - Create reminder

## Development Workflow

### Daily Development

1. **Start Services**:

   ```bash
   # Backend (Terminal 1)
   cd backend && npm run dev

   # Frontend (Terminal 2)
   cd frontend && npm run dev

   # VS Code Extension (Terminal 3, optional)
   cd vscode-extension && npm run watch
   ```

2. **Test Changes**:
   - Web interface: `http://localhost:5175`
   - API: `http://localhost:3001/api/health`
   - Extensions: Reload in respective environments

3. **Run Tests**:

   ```bash
   # Backend tests
   cd backend && npm test

   # Frontend tests
   cd frontend && npm test
   ```

### Code Quality

- **Linting**: ESLint configuration for all components
- **TypeScript**: Strict mode enabled
- **Testing**: Jest for unit tests
- **Documentation**: Markdown with consistent formatting

## Deployment

### Development
- Local SQLite database
- Hot reload for all components
- Debug configurations for VS Code

### Production
- Environment-specific configurations
- Database migration scripts
- Build optimization
- Security hardening

## Security Considerations

### Data Protection
- License keys encrypted at rest
- Secure credential storage
- HTTPS-only communication
- Input validation and sanitization

### Authentication
- JWT tokens with expiration
- Password hashing with bcrypt
- Rate limiting on API endpoints
- Session management

### Privacy
- No telemetry or tracking
- Local data storage
- User-controlled data sharing
- GDPR compliance ready

## Troubleshooting

### Common Issues

**Backend won't start**:
- Check port 3001 availability
- Verify Node.js version (18+)
- Check .env configuration

**Frontend build fails**:
- Clear node_modules and reinstall
- Check Node.js compatibility
- Verify .env.local configuration

**Extensions not loading**:
- Reload extensions in browser/VS Code
- Check manifest files
- Verify file paths

**Database issues**:
- Delete and recreate database (development)
- Check file permissions
- Verify SQLite3 installation

### Debug Tools

- **Browser DevTools**: For frontend and browser extension
- **VS Code Debugger**: For backend and VS Code extension
- **Postman/curl**: For API testing
- **Database browsers**: For SQLite inspection

## Contributing

### Code Contributions

1. **Fork and Clone**:
   ```bash
   git clone <your-fork-url>
   cd lifetime-license-manager
   ```

2. **Setup Development Environment**:
   - Follow [Development-Setup.md](Development-Setup.md)
   - Install all dependencies
   - Start development servers

3. **Make Changes**:
   - Create feature branch
   - Follow coding standards
   - Write tests for new features
   - Update documentation

4. **Submit PR**:
   - Ensure all tests pass
   - Update changelog
   - Provide clear description

### Documentation Contributions

- Update existing docs for accuracy
- Add new guides for missing features
- Improve examples and code snippets
- Fix formatting and typos

### Testing Contributions

- Write unit tests for new code
- Add integration tests
- Test across different environments
- Document test scenarios

## Changelog

### Version 1.0.0 (Current)
- ✅ Complete backend API with SQLite3
- ✅ Full React frontend with modern UI
- ✅ Browser extension with license detection
- ✅ VS Code extension with tree view
- ✅ End-to-end license management
- ✅ Multi-platform synchronization
- ✅ Security and encryption
- ✅ Comprehensive documentation

## Roadmap

### Short Term
- [ ] Mobile application (React Native)
- [ ] Additional deal site integrations
- [ ] Advanced reporting and analytics
- [ ] License sharing and collaboration

### Long Term
- [ ] Cloud deployment options
- [ ] Enterprise features
- [ ] API marketplace integration
- [ ] Advanced automation features

## Support

### Getting Help

1. **Check Documentation**: Review relevant guides first
2. **Search Issues**: Check existing GitHub issues
3. **Community**: Join discussions and ask questions
4. **Bug Reports**: Use issue templates with detailed information

### Issue Reporting

When reporting issues, include:

- **Environment**: OS, Node.js version, browser
- **Steps to reproduce**: Detailed reproduction steps
- **Expected vs actual**: What should happen vs what does
- **Logs**: Error messages, console output
- **Screenshots**: Visual evidence when applicable

## License

This project is licensed under the MIT License. See LICENSE file for details.

---

**LicenseVault** - Your lifetime license management solution.

For more detailed information, see the individual documentation files linked above.