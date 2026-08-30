# LicenseVault Monitoring & Logging Setup

## Overview
This document covers monitoring, logging, and alerting for LicenseVault in production.

## Application Monitoring

### PM2 Monitoring
```bash
# Start PM2 monitoring
pm2 monit

# View logs
pm2 logs licensevault-api

# Monitor resource usage
pm2 show licensevault-api
```

### Health Checks
The application includes built-in health checks:

- `/api/health` - Basic health check
- `/api/health/detailed` - Detailed health with database status

### Custom Metrics (Optional)
For advanced monitoring, consider integrating:

- **Prometheus** + **Grafana** for metrics collection
- **DataDog** or **New Relic** for application performance monitoring
- **Sentry** for error tracking

## Log Management

### Log Files
```
backend/logs/
├── app.log          # Application logs
├── error.log        # Error logs only
├── access.log       # HTTP access logs
└── combined.log     # All logs combined
```

### Log Rotation
```bash
# Install logrotate
sudo apt install logrotate

# Create logrotate config
sudo tee /etc/logrotate.d/licensevault << EOF
/var/www/licensevault/backend/logs/*.log {
    daily
    missingok
    rotate 52
    compress
    delaycompress
    notifempty
    create 644 www-data www-data
    postrotate
        pm2 reloadLogs
    endscript
}
EOF
```

### Centralized Logging (Optional)
For production environments, consider:

- **ELK Stack** (Elasticsearch, Logstash, Kibana)
- **Graylog** for log aggregation
- **CloudWatch** (AWS) or **Cloud Logging** (GCP)

## Database Monitoring

### SQLite Monitoring
```bash
# Check database size
ls -lh /var/www/licensevault/backend/data/app.db

# Check database integrity
sqlite3 /var/www/licensevault/backend/data/app.db "PRAGMA integrity_check;"

# Get database statistics
sqlite3 /var/www/licensevault/backend/data/app.db "PRAGMA stats;"
```

### Backup Monitoring
```bash
# List recent backups
ls -la /var/backups/licensevault/

# Check backup integrity
sqlite3 /var/backups/licensevault/latest.db "PRAGMA integrity_check;"
```

## System Monitoring

### Basic System Monitoring
```bash
# CPU usage
top -p $(pgrep -f "node server.js")

# Memory usage
ps aux --no-headers -o pmem,comm -C node | grep server.js

# Disk usage
df -h /var/www/licensevault

# Network connections
netstat -tlnp | grep :3001
```

### Advanced System Monitoring
```bash
# Install monitoring tools
sudo apt install htop iotop sysstat

# Monitor I/O
iotop -p $(pgrep -f "node server.js")

# System statistics
iostat -x 1 5
```

## Alerting

### PM2 Alerts
```bash
# Configure PM2 to send alerts
pm2 set pm2:slack-url https://hooks.slack.com/services/YOUR/SLACK/WEBHOOK
pm2 set pm2:slack-username LicenseVault
```

### Custom Alerts
Create monitoring scripts in `scripts/monitor.sh`:

```bash
#!/bin/bash

# Health check
if ! curl -f -s http://localhost:3001/api/health > /dev/null; then
    echo "Application is down!" | mail -s "LicenseVault Alert" admin@yourdomain.com
fi

# Disk space check
DISK_USAGE=$(df / | tail -1 | awk '{print $5}' | sed 's/%//')
if [ "$DISK_USAGE" -gt 90 ]; then
    echo "Disk usage is ${DISK_USAGE}%" | mail -s "LicenseVault Disk Alert" admin@yourdomain.com
fi

# Memory check
MEM_USAGE=$(ps aux --no-headers -o pmem -C node | awk '{sum+=$1} END {print sum}')
if (( $(echo "$MEM_USAGE > 80" | bc -l) )); then
    echo "High memory usage: ${MEM_USAGE}%" | mail -s "LicenseVault Memory Alert" admin@yourdomain.com
fi
```

### Cron Jobs for Monitoring
```bash
# Add to crontab
crontab -e

# Run health checks every 5 minutes
*/5 * * * * /var/www/licensevault/scripts/monitor.sh

# Daily backup check
0 2 * * * /var/www/licensevault/scripts/backup.sh
```

## Performance Optimization

### Database Optimization
```sql
-- Analyze query performance
EXPLAIN QUERY PLAN SELECT * FROM licenses WHERE user_id = ?;

-- Optimize indexes
CREATE INDEX idx_licenses_user_id ON licenses(user_id);
CREATE INDEX idx_commits_repository_id ON eduba_commits(repository_id);

-- Vacuum database regularly
sqlite3 /var/www/licensevault/backend/data/app.db "VACUUM;"
```

### Application Performance
```javascript
// Add performance monitoring to server.js
const responseTime = require('response-time');
app.use(responseTime((req, res, time) => {
  if (time > 1000) { // Log slow requests
    console.log(`${req.method} ${req.url} took ${time}ms`);
  }
}));
```

## Security Monitoring

### Access Monitoring
```bash
# Monitor failed login attempts
grep "Invalid or expired token" /var/www/licensevault/backend/logs/error.log | tail -10

# Monitor suspicious activity
grep "Rate limit exceeded" /var/www/licensevault/backend/logs/app.log
```

### SSL/TLS Monitoring
```bash
# Check SSL certificate expiry
openssl s_client -connect yourdomain.com:443 -servername yourdomain.com < /dev/null 2>/dev/null | openssl x509 -noout -dates

# SSL Labs test
curl -s "https://www.ssllabs.com/ssltest/analyze.html?d=yourdomain.com" | grep -o '"grade":"[^"]*"' | tail -1
```

## Backup Strategy

### Automated Backups
```bash
#!/bin/bash
# scripts/backup.sh

BACKUP_DIR="/var/backups/licensevault"
TIMESTAMP=$(date +%Y%m%d_%H%M%S)

# Database backup
sqlite3 /var/www/licensevault/backend/data/app.db ".backup '$BACKUP_DIR/db_$TIMESTAMP.db'"

# File backup
tar -czf "$BACKUP_DIR/files_$TIMESTAMP.tar.gz" -C /var/www licensevault

# Retention policy (keep last 30 days)
find "$BACKUP_DIR" -name "*.db" -mtime +30 -delete
find "$BACKUP_DIR" -name "*.tar.gz" -mtime +30 -delete

# Offsite backup (optional)
# rsync -avz "$BACKUP_DIR/" user@backup-server:/backups/licensevault/
```

### Disaster Recovery
1. **Quick Recovery**: Restore from latest backup
2. **Full Recovery**: Rebuild from Docker image + database backup
3. **Data Recovery**: Use Eduba exports for code vault recovery

## Scaling Considerations

### Horizontal Scaling
- Use load balancer (nginx) for multiple instances
- Session storage in Redis/external database
- Shared file storage (NFS/S3)

### Vertical Scaling
- Monitor resource usage
- Upgrade VPS specifications as needed
- Optimize database queries and indexes

## Compliance & Auditing

### Audit Logs
```javascript
// Add audit logging middleware
app.use((req, res, next) => {
  const auditLog = {
    timestamp: new Date(),
    method: req.method,
    url: req.url,
    ip: req.ip,
    user: req.user?.id || 'anonymous'
  };
  fs.appendFileSync('logs/audit.log', JSON.stringify(auditLog) + '\n');
  next();
});
```

### GDPR Compliance
- Implement data retention policies
- Add data export/deletion endpoints
- Log all data access operations