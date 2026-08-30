#!/bin/bash

# LicenseVault Frontend Deployment Script for Zap Hosting Web Space
# This script builds and deploys the frontend to web space via FTP

set -e

echo "🚀 Deploying LicenseVault Frontend to Zap Hosting Web Space..."

# Configuration - Update these values
FTP_HOST="your-webspace-host.zap-hosting.com"
FTP_USER="your-ftp-username"
FTP_PASS="your-ftp-password"
REMOTE_DIR="/"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

error() {
    echo -e "${RED}[ERROR] $1${NC}" >&2
}

warn() {
    echo -e "${YELLOW}[WARNING] $1${NC}"
}

# Check dependencies
check_dependencies() {
    if ! command -v npm &> /dev/null; then
        error "npm is not installed"
        exit 1
    fi

    if ! command -v lftp &> /dev/null; then
        warn "lftp not found, trying to install..."
        if command -v apt &> /dev/null; then
            sudo apt update && sudo apt install -y lftp
        elif command -v yum &> /dev/null; then
            sudo yum install -y lftp
        else
            error "Please install lftp manually"
            exit 1
        fi
    fi
}

# Build frontend
build_frontend() {
    log "Building frontend..."

    cd frontend

    # Install dependencies
    npm install

    # Build for production
    npm run build

    # Check if build was successful
    if [ ! -d "dist" ]; then
        error "Build failed - dist directory not found"
        exit 1
    fi

    log "Frontend built successfully"
}

# Deploy via FTP
deploy_ftp() {
    log "Deploying via FTP..."

    cd frontend

    # Create lftp script
    cat > deploy.lftp << EOF
open -u $FTP_USER,$FTP_PASS $FTP_HOST
mirror -R -v dist/ $REMOTE_DIR
exit
EOF

    # Execute FTP upload
    if lftp -f deploy.lftp; then
        log "FTP upload completed"
    else
        error "FTP upload failed"
        exit 1
    fi

    # Cleanup
    rm deploy.lftp
}

# Update API base URL for production
update_api_url() {
    log "Updating API base URL for production..."

    cd frontend/dist

    # Find and replace localhost with production API URL
    # Update this with your actual production API URL
    PRODUCTION_API_URL="https://api.yourdomain.com"

    find . -name "*.js" -o -name "*.html" | xargs sed -i "s|http://localhost:3001|$PRODUCTION_API_URL|g"

    log "API URLs updated"
}

# Create deployment info
create_deployment_info() {
    log "Creating deployment info..."

    cd frontend

    # Create deployment info file
    cat > dist/DEPLOYMENT_INFO.txt << EOF
LicenseVault Frontend Deployment
===============================

Deployed on: $(date)
Build: $(git rev-parse --short HEAD 2>/dev/null || echo "unknown")
Node version: $(node --version)
NPM version: $(npm --version)

Files deployed to: $FTP_HOST$REMOTE_DIR

Configuration:
- API Base URL: $PRODUCTION_API_URL
- Build mode: production
EOF

    log "Deployment info created"
}

# Health check
health_check() {
    log "Performing health check..."

    # Wait a moment for files to propagate
    sleep 10

    # Try to access the deployed site
    if curl -f -s -I "https://$FTP_HOST" > /dev/null 2>&1; then
        log "✅ Frontend is accessible"
    else
        warn "⚠️  Frontend health check failed - files may still be propagating"
        log "   Manual check: https://$FTP_HOST"
    fi
}

# Main deployment function
main() {
    log "Starting frontend deployment..."

    check_dependencies
    build_frontend
    update_api_url
    create_deployment_info
    deploy_ftp
    health_check

    log "🎉 Frontend deployment completed!"
    log ""
    log "Frontend URL: https://$FTP_HOST"
    log "Deployment info: Check dist/DEPLOYMENT_INFO.txt"
}

# Run main function
main "$@"