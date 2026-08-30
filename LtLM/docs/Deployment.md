# Deployment Guide for Zap Hosting

This guide covers deploying the Lifetime License Manager to Zap Hosting VPS and Web Space.

## Prerequisites

- Zap Hosting VPS account with Ubuntu
- Zap Hosting Web Space account
- SSH access to VPS
- FTP/SFTP access to Web Space

## VPS Deployment (Backend API)

### 1. Server Preparation

```bash
# Update system
sudo apt update && sudo apt upgrade -y

# Install Node.js 18+
curl -fsSL https://deb.nodesource.com/setup_18.x | sudo -E bash -
sudo apt-get install -y nodejs

# Install PM2 for process management
sudo npm install -g pm2

# Install nginx
sudo apt install nginx -y

# Install certbot for SSL (optional)
sudo apt install certbot python3-certbot-nginx -y
```

### 2. Application Deployment

```bash
# Create application directory
sudo mkdir -p /var/www/licensevault
sudo chown -R $USER:$USER /var/www/licensevault

# Clone or upload application
cd /var/www/licensevault
# Upload your application files here

# Install dependencies
cd backend
npm install --production

# Create production .env file
cp .env.example .env
# Edit .env with production values
```

### 3. Database Setup

```bash
# Initialize database
cd backend
node -e "require('./database').initializeDatabase().then(() => console.log('DB ready')).catch(console.error)"

# Run migrations if any
# npm run migrate
```

### 4. PM2 Configuration

Create `ecosystem.config.js`:

```javascript
module.exports = {
  apps: [{
    name: 'licensevault-api',
    script: 'server.js',
    cwd: '/var/www/licensevault/backend',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3001
    }
  }]
};
```

```bash
# Start application
pm2 start ecosystem.config.js
pm2 save
pm2 startup
```

### 5. Nginx Configuration

Create `/etc/nginx/sites-available/licensevault`:

```nginx
server {
    listen 80;
    server_name your-domain.com;

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
}
```

```bash
# Enable site
sudo ln -s /etc/nginx/sites-available/licensevault /etc/nginx/sites-enabled/
sudo nginx -t
sudo systemctl reload nginx
```

## Web Space Deployment (Frontend)

### 1. Build Frontend

```bash
cd frontend
npm install
npm run build
```

### 2. Upload to Web Space

Upload the `dist/` folder contents to your Zap Hosting Web Space via FTP/SFTP.

### 3. Configure Web Space

- Set document root to the uploaded folder
- Configure any necessary redirects
- Set up SSL certificate if available

## SSL Configuration (Optional)

```bash
# For VPS
sudo certbot --nginx -d your-domain.com

# For Web Space, use Zap Hosting's SSL tools
```

## Monitoring & Maintenance

### PM2 Commands

```bash
pm2 status
pm2 logs licensevault-api
pm2 restart licensevault-api
pm2 stop licensevault-api
```

### Nginx Logs

```bash
sudo tail -f /var/log/nginx/access.log
sudo tail -f /var/log/nginx/error.log
```

### Backup Strategy

```bash
# Database backup
sqlite3 /var/www/licensevault/backend/app.db .dump > backup.sql

# File backup
tar -czf backup.tar.gz /var/www/licensevault
```

## Environment Variables

Create production `.env` file:

```bash
NODE_ENV=production
PORT=3001
JWT_SECRET=your-production-jwt-secret
SESSION_SECRET=your-production-session-secret
DATABASE_URL=./app.db

# Zap Hosting specific
ZAP_VPS_HOST=your-vps-host
ZAP_WEBSPACE_HOST=your-webspace-host
```

## Troubleshooting

### Common Issues

1. **Port already in use**: Check if another service is using port 3001
2. **Permission denied**: Ensure proper file permissions
3. **Database connection failed**: Verify database path and permissions
4. **CORS issues**: Update CORS origins in production config

### Logs Location

- Application logs: `pm2 logs`
- Nginx logs: `/var/log/nginx/`
- System logs: `journalctl -u nginx`
