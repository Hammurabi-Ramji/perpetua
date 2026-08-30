#!/bin/bash

# LicenseVault Production Setup Script
# This script sets up the complete production environment

set -e

echo "🔧 Setting up LicenseVault Production Environment..."

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
NC='\033[0m'

log() {
    echo -e "${GREEN}[$(date +'%Y-%m-%d %H:%M:%S')] $1${NC}"
}

error() {
    echo -e "${RED}[ERROR] $1${NC}" >&2
    exit 1
}

warn() {
    echo -e "${YELLOW}[WARNING] $1${NC}"
}

# Check if running as root
check_root() {
    if [[ $EUID -eq 0 ]]; then
        error "Do not run this script as root. Use sudo for specific commands."
    fi
}

# Install system dependencies
install_system_deps() {
    log "Installing system dependencies..."

    # Update package list
    sudo apt update

    # Install Node.js 18
    if ! command -v node &> /dev/null || [[ "$(node --version)" != "v18"* ]]; then
        log "Installing Node.js 18..."
        curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
        sudo apt-get install -y nodejs
    fi

    # Install PM2
    if ! command -v pm2 &> /dev/null; then
        log "Installing PM2..."
        sudo npm install -g pm2
    fi

    # Install Nginx
    if ! command -v nginx &> /dev/null; then
        log "Installing Nginx..."
        sudo apt install -y nginx
    fi

    # Install Docker (optional)
    if ! command -v docker &> /dev/null; then
        warn "Docker not found. Install Docker manually if using containerized deployment."
    fi

    # Install monitoring tools
    sudo apt install -y htop iotop sysstat curl wget

    log "System dependencies installed"
}

# Setup application directories
setup_directories() {
    log "Setting up application directories..."

    # Create main application directory
    sudo mkdir -p /var/www/licensevault
    sudo chown -R "$USER:$USER" /var/www/licensevault

    # Create subdirectories
    mkdir -p /var/www/licensevault/{backend,frontend,scripts,data,temp,logs,backup}

    # Create backup directory
    sudo mkdir -p /var/backups/licensevault
    sudo chown "$USER:$USER" /var/backups/licensevault

    log "Directories created"
}

# Setup production environment
setup_environment() {
    log "Setting up production environment..."

    # Copy environment template
    if [ -f ".env.production" ]; then
        cp .env.production /var/www/licensevault/backend/.env
        warn "Please edit /var/www/licensevault/backend/.env with production values"
    else
        warn ".env.production template not found"
    fi

    log "Environment setup complete"
}

# Deploy application
deploy_application() {
    log "Deploying application..."

    # This assumes application files are in current directory
    # In production, this would be done via git clone or file upload

    if [ ! -f "backend/package.json" ]; then
        error "Application files not found in current directory"
    fi

    # Copy files
    cp -r backend/* /var/www/licensevault/backend/
    cp -r frontend/* /var/www/licensevault/frontend/ 2>/dev/null || true
    cp -r scripts/* /var/www/licensevault/scripts/ 2>/dev/null || true

    # Install dependencies
    cd /var/www/licensevault/backend
    npm install --production

    # Build frontend if present
    if [ -f "../frontend/package.json" ]; then
        cd ../frontend
        npm install
        npm run build
        cd ../backend
    fi

    log "Application deployed"
}

# Setup database
setup_database() {
    log "Setting up database..."

    cd /var/www/licensevault/backend

    # Initialize database
    if [ ! -f "data/app.db" ]; then
        node -e "require('./database').initializeDatabase().then(() => console.log('Database initialized')).catch(console.error)"
    fi

    log "Database setup complete"
}

# Configure PM2
setup_pm2() {
    log "Configuring PM2..."

    cd /var/www/licensevault

    # Create ecosystem config
    cat > ecosystem.config.js << 'EOF'
module.exports = {
  apps: [{
    name: 'licensevault-api',
    script: 'backend/server.js',
    cwd: '/var/www/licensevault',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    },
    error_file: './logs/err.log',
    out_file: './logs/out.log',
    log_file: './logs/combined.log'
  }]
};
EOF

    log "PM2 configuration created"
}

# Configure Nginx
setup_nginx() {
    log "Configuring Nginx..."

    # Create nginx config
    sudo tee /etc/nginx/sites-available/licensevault > /dev/null << 'EOF'
server {
    listen 80;
    server_name _;

    # Security headers
    add_header X-Frame-Options "SAMEORIGIN" always;
    add_header X-XSS-Protection "1; mode=block" always;
    add_header X-Content-Type-Options "nosniff" always;

    location / {
        proxy_pass http://localhost:3001;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_cache_bypass $http_upgrade;
    }

    # Static files
    location ~* \.(js|css|png|jpg|jpeg|gif|ico|svg)$ {
        expires 1y;
        add_header Cache-Control "public, immutable";
    }
}
EOF

    # Enable site
    sudo ln -sf /etc/nginx/sites-available/licensevault /etc/nginx/sites-enabled/
    sudo rm -f /etc/nginx/sites-enabled/default

    # Test configuration
    if sudo nginx -t; then
        log "Nginx configuration is valid"
    else
        error "Nginx configuration is invalid"
    fi
}

# Setup monitoring
setup_monitoring() {
    log "Setting up monitoring..."

    cd /var/www/licensevault

    # Create monitoring script
    cat > scripts/monitor.sh << 'EOF'
#!/bin/bash

# Health check
if ! curl -f -s http://localhost:3001/api/health > /dev/null; then
    echo "Application is down!" | mail -s "LicenseVault Alert" admin@localhost 2>/dev/null || true
fi

# Disk space check
DISK_USAGE=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')
if [ "$DISK_USAGE" -gt 90 ]; then
    echo "Disk usage is ${DISK_USAGE}%" | mail -s "LicenseVault Disk Alert" admin@localhost 2>/dev/null || true
fi
EOF

    chmod +x scripts/monitor.sh

    # Create backup script
    cat > scripts/backup.sh << 'EOF'
#!/bin/bash

BACKUP_DIR="/var/backups/licensevault"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

mkdir -p "$BACKUP_DIR"

# Database backup
sqlite3 /var/www/licensevault/backend/data/app.db ".backup '$BACKUP_DIR/db_$TIMESTAMP.db'"

# Keep only last 7 backups
ls -t "$BACKUP_DIR"/db_*.db | tail -n +8 | xargs rm -f 2>/dev/null || true

echo "Backup completed: $BACKUP_DIR/db_$TIMESTAMP.db"
EOF

    chmod +x scripts/backup.sh

    log "Monitoring scripts created"
}

# Setup cron jobs
setup_cron() {
    log "Setting up cron jobs..."

    # Add cron jobs
    (crontab -l 2>/dev/null; echo "*/5 * * * * /var/www/licensevault/scripts/monitor.sh") | crontab -
    (crontab -l 2>/dev/null; echo "0 2 * * * /var/www/licensevault/scripts/backup.sh") | crontab -

    log "Cron jobs configured"
}

# Start services
start_services() {
    log "Starting services..."

    cd /var/www/licensevault

    # Start PM2 app
    pm2 stop licensevault-api 2>/dev/null || true
    pm2 delete licensevault-api 2>/dev/null || true
    pm2 start ecosystem.config.js

    # Save PM2 configuration
    pm2 save

    # Setup PM2 startup
    sudo env PATH="$PATH:/usr/bin" pm2 startup systemd -u "$USER" --hp "$HOME" || true

    # Reload Nginx
    sudo systemctl reload nginx

    log "Services started"
}

# Final checks
final_checks() {
    log "Performing final checks..."

    sleep 5

    # Check if app is responding
    if curl -f -s http://localhost:3001/api/health > /dev/null; then
        log "✅ Application is responding"
    else
        warn "⚠️  Application health check failed"
    fi

    # Check PM2 status
    if pm2 jlist | grep -q '"name":"licensevault-api"'; then
        log "✅ PM2 process is running"
    else
        error "❌ PM2 process is not running"
    fi

    # Check Nginx status
    if sudo systemctl is-active --quiet nginx; then
        log "✅ Nginx is running"
    else
        error "❌ Nginx is not running"
    fi
}

# Print success message
success_message() {
    log ""
    log "🎉 LicenseVault production setup completed!"
    log ""
    log "Application URL: http://$(curl -s ifconfig.me 2>/dev/null || echo 'your-server-ip')"
    log "Health Check: curl http://localhost:3001/api/health"
    log "PM2 Status: pm2 status"
    log "Application Logs: pm2 logs licensevault-api"
    log "Nginx Logs: sudo tail -f /var/log/nginx/error.log"
    log ""
    log "Next steps:"
    log "1. Edit /var/www/licensevault/backend/.env with production values"
    log "2. Configure SSL certificate for HTTPS"
    log "3. Set up domain name and DNS"
    log "4. Configure email settings for notifications"
    log "5. Test all features thoroughly"
}

# Main function
main() {
    log "Starting LicenseVault production setup..."

    check_root
    install_system_deps
    setup_directories
    setup_environment
    deploy_application
    setup_database
    setup_pm2
    setup_nginx
    setup_monitoring
    setup_cron
    start_services
    final_checks
    success_message
}

# Run main function
main "$@"