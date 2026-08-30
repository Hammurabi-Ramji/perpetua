#!/bin/bash

# LicenseVault Deployment Script for Zap Hosting VPS
# This script automates the deployment process to Ubuntu VPS

set -e

echo "🚀 Starting LicenseVault deployment to Zap Hosting VPS..."

# Configuration
APP_NAME="licensevault"
APP_DIR="/var/www/$APP_NAME"
BACKUP_DIR="/var/backups/$APP_NAME"
NODE_VERSION="18"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

error() {
    echo -e "${RED}[ERROR] $1${NC}" >&2
}

warn() {
    echo -e "${YELLOW}[WARNING] $1${NC}"
}

# Check if running as root
if [[ $EUID -eq 0 ]]; then
   error "This script should not be run as root"
   exit 1
fi

# Create backup
create_backup() {
    log "Creating backup..."
    sudo mkdir -p "$BACKUP_DIR"
    if [ -d "$APP_DIR" ]; then
        sudo tar -czf "$BACKUP_DIR/backup-$(date +%Y%m%d-%H%M%S).tar.gz" -C /var/www "$APP_NAME" 2>/dev/null || true
        log "Backup created: $BACKUP_DIR/backup-$(date +%Y%m%d-%H%M%S).tar.gz"
    fi
}

# Install system dependencies
install_dependencies() {
    log "Installing system dependencies..."

    # Update package list
    sudo apt update

    # Install Node.js if not present
    if ! command -v node &> /dev/null; then
        log "Installing Node.js $NODE_VERSION..."
        curl -fsSL "https://deb.nodesource.com/setup_$NODE_VERSION.x" | sudo -E bash -
        sudo apt-get install -y nodejs
    fi

    # Install PM2 if not present
    if ! command -v pm2 &> /dev/null; then
        log "Installing PM2..."
        sudo npm install -g pm2
    fi

    # Install nginx if not present
    if ! command -v nginx &> /dev/null; then
        log "Installing Nginx..."
        sudo apt install -y nginx
    fi

    log "Dependencies installed successfully"
}

# Setup application directory
setup_app_directory() {
    log "Setting up application directory..."

    # Create application directory
    sudo mkdir -p "$APP_DIR"
    sudo chown -R "$USER:$USER" "$APP_DIR"

    # Create temp directory for uploads
    mkdir -p "$APP_DIR/backend/temp"
    mkdir -p "$APP_DIR/frontend/dist"

    log "Application directory setup complete"
}

# Deploy application files
deploy_files() {
    log "Deploying application files..."

    # This assumes files are uploaded via SCP/SFTP before running this script
    # In a real CI/CD pipeline, this would pull from git or copy from build artifacts

    if [ ! -f "$APP_DIR/backend/package.json" ]; then
        error "Application files not found in $APP_DIR/backend/"
        error "Please upload application files before running this script"
        exit 1
    fi

    log "Application files found"
}

# Install Node.js dependencies
install_app_dependencies() {
    log "Installing application dependencies..."

    cd "$APP_DIR/backend"

    # Clean install for production
    rm -rf node_modules package-lock.json
    npm install --production

    # Check if frontend needs building
    if [ -f "$APP_DIR/frontend/package.json" ]; then
        log "Building frontend..."
        cd "$APP_DIR/frontend"
        npm install
        npm run build
        cd "$APP_DIR/backend"
    fi

    log "Dependencies installed"
}

# Setup database
setup_database() {
    log "Setting up database..."

    cd "$APP_DIR/backend"

    # Initialize database if it doesn't exist
    if [ ! -f "app.db" ]; then
        log "Initializing database..."
        node -e "require('./database').initializeDatabase().then(() => console.log('Database initialized')).catch(console.error)"
    else
        log "Database already exists"
    fi
}

# Configure PM2
setup_pm2() {
    log "Configuring PM2..."

    # Create ecosystem config
    cat > "$APP_DIR/ecosystem.config.js" << EOF
module.exports = {
  apps: [{
    name: '$APP_NAME-api',
    script: 'server.js',
    cwd: '$APP_DIR/backend',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    error_file: '$APP_DIR/logs/err.log',
    out_file: '$APP_DIR/logs/out.log',
    log_file: '$APP_DIR/logs/combined.log'
  }]
};
EOF

    # Create logs directory
    mkdir -p "$APP_DIR/logs"

    log "PM2 configuration created"
}

# Configure Nginx
setup_nginx() {
    log "Configuring Nginx..."

    # Create nginx config
    sudo tee "/etc/nginx/sites-available/$APP_NAME" > /dev/null << EOF
server {
    listen 80;
    server_name _;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;
    add_header Referrer-Policy "no-referrer-when-downgrade" always;
    add_header Content-Security-Policy "default-src 'self' http: https: data: blob: 'unsafe-inline'" always;

    # Gzip compression
    gzip on;
    gzip_vary on;
    gzip_min_length 1024;
    gzip_types text/plain text/css text/xml text/javascript application/javascript application/xml+rss application/json;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade \$http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host \$host;
        proxy_set_header X-Real-IP \$remote_addr;
        proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto \$scheme;
        proxy_cache_bypass \$http_upgrade;

        # Timeout settings
        proxy_connect_timeout 60s;
        proxy_send_timeout 60s;
        proxy_read_timeout 60s;
    }

    # Static files caching
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
EOF

    # Enable site
    sudo ln -sf "/etc/nginx/sites-available/$APP_NAME" "/etc/nginx/sites-enabled/"

    # Remove default site if it exists
    sudo rm -f "/etc/nginx/sites-enabled/default"

    # Test configuration
    if sudo nginx -t; then
        log "Nginx configuration is valid"
    else
        error "Nginx configuration is invalid"
        exit 1
    fi
}

# Start services
start_services() {
    log "Starting services..."

    # Start PM2 app
    cd "$APP_DIR"
    pm2 stop "$APP_NAME-api" 2>/dev/null || true
    pm2 delete "$APP_NAME-api" 2>/dev/null || true
    pm2 start ecosystem.config.js

    # Save PM2 configuration
    pm2 save

    # Setup PM2 startup script (run once)
    if ! pm2 startup | grep -q "already configured"; then
        sudo env PATH="$PATH:/usr/bin" pm2 startup systemd -u "$USER" --hp "$HOME"
    fi

    # Reload Nginx
    sudo systemctl reload nginx

    log "Services started"
}

# Health check
health_check() {
    log "Performing health check..."

    # Wait for app to start
    sleep 5

    # Check if app is responding
    if curl -f -s "http://localhost:3001/api/health" > /dev/null; then
        log "✅ Application is responding"
    else
        warn "⚠️  Application health check failed"
    fi

    # Check PM2 status
    if pm2 jlist | grep -q '"name":"'$APP_NAME'-api"'; then
        log "✅ PM2 process is running"
    else
        error "❌ PM2 process is not running"
        exit 1
    fi

    # Check Nginx status
    if sudo systemctl is-active --quiet nginx; then
        log "✅ Nginx is running"
    else
        error "❌ Nginx is not running"
        sudo systemctl status nginx
        exit 1
    fi
}

# Main deployment function
main() {
    log "Starting deployment process..."

    create_backup
    install_dependencies
    setup_app_directory
    deploy_files
    install_app_dependencies
    setup_database
    setup_pm2
    setup_nginx
    start_services
    health_check

    log "🎉 Deployment completed successfully!"
    log ""
    log "Application URL: http://$(curl -s ifconfig.me)"
    log "PM2 Status: pm2 status"
    log "Application Logs: pm2 logs $APP_NAME-api"
    log "Nginx Logs: sudo tail -f /var/log/nginx/error.log"
}

# Run main function
main "$@"