# LicenseVault API Documentation

## Overview

The LicenseVault API provides RESTful endpoints for managing software licenses, user authentication, site connections, and notifications.

## Base URL

```bash
http://localhost:3001/api
```

## Authentication

All API requests (except registration and login) require JWT authentication. Include the JWT token in the Authorization header:

```http
Authorization: Bearer <jwt_token>
```

## Endpoints

### Authentication

#### POST /auth/register

Register a new user account.

**Request Body:**
```json
{
  "username": "string",
  "email": "string",
  "password": "string"
}
```

**Response:**
```json
{
  "message": "User registered successfully",
  "user": {
    "id": "number",
    "username": "string",
    "email": "string"
  }
}
```

**Status Codes:**
- `201` - User created successfully
- `400` - Invalid request data
- `409` - User already exists

#### POST /auth/login

Authenticate user and return JWT token.

**Request Body:**
```json
{
  "email": "string",
  "password": "string"
}
```

**Response:**
```json
{
  "message": "Login successful",
  "token": "jwt_token_string",
  "user": {
    "id": "number",
    "username": "string",
    "email": "string"
  }
}
```

**Status Codes:**
- `200` - Login successful
- `401` - Invalid credentials

### Licenses

#### GET /licenses

Get all licenses for the authenticated user.

**Response:**
```json
{
  "licenses": [
    {
      "id": "number",
      "site": "string",
      "product_name": "string",
      "license_key": "string",
      "status": "active|expired|redeemed",
      "action_required": "redeem|renew|none",
      "created_at": "timestamp",
      "updated_at": "timestamp"
    }
  ]
}
```

#### GET /licenses/stats

Get license statistics for dashboard display.

**Response:**
```json
{
  "total_licenses": "number",
  "active_licenses": "number",
  "expired_licenses": "number",
  "action_required": "number",
  "recent_licenses": [
    {
      "id": "number",
      "site": "string",
      "product_name": "string",
      "created_at": "timestamp"
    }
  ]
}
```

#### GET /licenses/:id

Get a specific license by ID.

**Parameters:**
- `id` (path) - License ID

**Response:**
```json
{
  "license": {
    "id": "number",
    "site": "string",
    "product_name": "string",
    "license_key": "string",
    "status": "active|expired|redeemed",
    "action_required": "redeem|renew|none",
    "metadata": "object",
    "created_at": "timestamp",
    "updated_at": "timestamp"
  }
}
```

#### PATCH /licenses/:id/action

Update the action status of a license.

**Parameters:**
- `id` (path) - License ID

**Request Body:**
```json
{
  "action": "redeemed|renewed|expired"
}
```

**Response:**
```json
{
  "message": "License action updated successfully",
  "license": {
    "id": "number",
    "action_required": "none"
  }
}
```

### Sites

#### GET /sites/connections

Get all connected sites for the authenticated user.

**Response:**
```json
{
  "connections": [
    {
      "id": "number",
      "site": "string",
      "status": "connected|disconnected",
      "last_sync": "timestamp",
      "credentials_valid": "boolean"
    }
  ]
}
```

#### POST /sites/:site/connect

Connect to a deal site with credentials.

**Parameters:**
- `site` (path) - Site name (appsumo, producthunt, stacksocial, humblebundle)

**Request Body:**
```json
{
  "username": "string",
  "password": "string"
}
```

**Response:**
```json
{
  "message": "Site connected successfully",
  "connection": {
    "id": "number",
    "site": "string",
    "status": "connected"
  }
}
```

#### POST /sites/:site/sync

Manually sync licenses from a connected site.

**Parameters:**
- `site` (path) - Site name

**Response:**
```json
{
  "message": "Sync initiated successfully",
  "sync_id": "string"
}
```

#### DELETE /sites/:site

Disconnect from a site.

**Parameters:**
- `site` (path) - Site name

**Response:**
```json
{
  "message": "Site disconnected successfully"
}
```

### Reminders

#### GET /reminders

Get all reminders for the authenticated user.

**Response:**
```json
{
  "reminders": [
    {
      "id": "number",
      "license_id": "number",
      "type": "expiration|renewal|action",
      "message": "string",
      "scheduled_for": "timestamp",
      "sent": "boolean"
    }
  ]
}
```

#### POST /reminders

Create a new reminder.

**Request Body:**
```json
{
  "license_id": "number",
  "type": "expiration|renewal|action",
  "message": "string",
  "scheduled_for": "timestamp"
}
```

**Response:**
```json
{
  "message": "Reminder created successfully",
  "reminder": {
    "id": "number",
    "license_id": "number",
    "type": "string",
    "message": "string",
    "scheduled_for": "timestamp"
  }
}
```

#### GET /reminders/settings

Get reminder settings for the user.

**Response:**
```json
{
  "settings": {
    "email_enabled": "boolean",
    "browser_enabled": "boolean",
    "reminder_days_before": "number"
  }
}
```

#### PATCH /reminders/settings

Update reminder settings.

**Request Body:**
```json
{
  "email_enabled": "boolean",
  "browser_enabled": "boolean",
  "reminder_days_before": "number"
}
```

**Response:**
```json
{
  "message": "Reminder settings updated successfully",
  "settings": {
    "email_enabled": "boolean",
    "browser_enabled": "boolean",
    "reminder_days_before": "number"
  }
}
```

## Error Responses

All error responses follow this format:

```json
{
  "error": "Error message",
  "code": "ERROR_CODE",
  "details": "Additional error details (optional)"
}
```

### Common Error Codes

- `VALIDATION_ERROR` - Invalid request data
- `AUTHENTICATION_ERROR` - Invalid or missing authentication
- `AUTHORIZATION_ERROR` - Insufficient permissions
- `NOT_FOUND` - Resource not found
- `CONFLICT` - Resource conflict
- `INTERNAL_ERROR` - Server internal error

## Rate Limiting

API requests are rate limited to prevent abuse:

- 100 requests per minute for authenticated endpoints
- 10 requests per minute for authentication endpoints

Rate limit headers are included in responses:

```
X-RateLimit-Limit: 100
X-RateLimit-Remaining: 95
X-RateLimit-Reset: 1640995200
```

## Data Encryption

All sensitive data (license keys, credentials) are encrypted using AES-256-GCM before storage in the database. Encryption keys are managed securely and never exposed in API responses.