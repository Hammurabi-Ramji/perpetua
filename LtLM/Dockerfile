# LicenseVault Docker Setup
# Multi-stage build for optimized production images

# Build stage
FROM node:18-alpine AS builder

# Set working directory
WORKDIR /app

# Copy package files
COPY backend/package*.json ./backend/
COPY frontend/package*.json ./frontend/

# Install dependencies
RUN cd backend && npm ci --only=production
RUN cd frontend && npm ci

# Copy source code
COPY backend/ ./backend/
COPY frontend/ ./frontend/

# Build frontend
RUN cd frontend && npm run build

# Production stage
FROM node:18-alpine AS production

# Install dumb-init and create app user
RUN apk add --no-cache dumb-init && \
    addgroup -g 1001 -S nodejs && \
    adduser -S licensevault -u 1001

# Set working directory
WORKDIR /app

# Copy built application
COPY --from=builder --chown=licensevault:nodejs /app/backend ./backend
COPY --from=builder --chown=licensevault:nodejs /app/frontend/dist ./frontend/dist

# Create necessary directories
RUN mkdir -p backend/temp backend/logs && \
    chown -R licensevault:nodejs backend/temp backend/logs

# Switch to non-root user
USER licensevault

# Expose port
EXPOSE 3001

# Health check
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD node -e "require('http').get('http://localhost:3001/api/health', (res) => { \
    process.exit(res.statusCode === 200 ? 0 : 1) \
  }).on('error', () => process.exit(1))"

# Start application
ENTRYPOINT ["dumb-init", "--"]
CMD ["node", "backend/server.js"]