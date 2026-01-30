# Sprint 1.1: RBAC Implementation Spec

**Duration**: 2 days
**Dependencies**: None
**Output**: Multi-user system with role-based access control

---

## Overview

Implement role-based access control (RBAC) supporting three roles: Admin, Editor, Viewer. Single organization instance with multiple users.

## Database Schema Changes

### New Table: `users`

```sql
-- migrations/legacy/001_add_rbac.sql

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL DEFAULT 'viewer', -- 'admin', 'editor', 'viewer'
  display_name TEXT,
  is_active INTEGER DEFAULT 1,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  last_login_at TEXT
);

-- Create audit log table
CREATE TABLE IF NOT EXISTS audit_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id INTEGER,
  details TEXT, -- JSON string
  ip_address TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

-- Create indexes
CREATE INDEX idx_users_email ON users(email);
CREATE INDEX idx_users_role ON users(role);
CREATE INDEX idx_audit_log_user ON audit_log(user_id);
CREATE INDEX idx_audit_log_created ON audit_log(created_at);

-- Insert default admin user (password: LOCAL_ADMIN_PASSWORD)
INSERT INTO users (email, password_hash, role, display_name)
VALUES (
  'admin@example.com',
  '$2a$10$rN8PY.6qVzJQZz3vGQQQQe9QZzQQQQQQQQQQQQQQQQQQQQQQQQQQQQ', -- bcrypt hash
  'admin',
  'System Administrator'
);
```

### Migration for Existing Data

```sql
-- Update events table to track creator
ALTER TABLE events ADD COLUMN created_by_user_id INTEGER REFERENCES users(id);
ALTER TABLE bands ADD COLUMN created_by_user_id INTEGER REFERENCES users(id);
ALTER TABLE venues ADD COLUMN created_by_user_id INTEGER REFERENCES users(id);
```

---

## Role Permissions Matrix

| Action                   | Admin | Editor | Viewer |
| ------------------------ | ----- | ------ | ------ |
| View events/bands/venues | ✅    | ✅     | ✅     |
| Create events            | ✅    | ✅     | ❌     |
| Edit events              | ✅    | ✅     | ❌     |
| Delete events            | ✅    | ❌     | ❌     |
| Publish/unpublish events | ✅    | ✅     | ❌     |
| Manage bands             | ✅    | ✅     | ❌     |
| Manage venues            | ✅    | ✅     | ❌     |
| View users               | ✅    | ❌     | ❌     |
| Create users             | ✅    | ❌     | ❌     |
| Edit users               | ✅    | ❌     | ❌     |
| Delete users             | ✅    | ❌     | ❌     |
| View audit log           | ✅    | ❌     | ❌     |

---

## API Endpoints

### Authentication (Update Existing)

**File**: `functions/api/admin/auth/login.js`

```javascript
// UPDATE: Return user role in JWT payload
{
  userId: user.id,
  email: user.email,
  role: user.role,           // NEW
  displayName: user.display_name  // NEW
}
```

### User Management (New)

#### 1. List Users

**Endpoint**: `GET /api/admin/users`
**Permission**: Admin only
**File**: `functions/api/admin/users.js`

```javascript
// Request: None
// Response:
{
  "users": [
    {
      "id": 1,
      "email": "admin@example.com",
      "role": "admin",
      "displayName": "System Administrator",
      "isActive": true,
      "createdAt": "2025-11-01T...",
      "lastLoginAt": "2025-11-11T..."
    }
  ]
}
```

#### 2. Create User

**Endpoint**: `POST /api/admin/users`
**Permission**: Admin only
**File**: `functions/api/admin/users.js`

```javascript
// Request:
{
  "email": "editor@example.com",
  "password": "temp123",
  "role": "editor",
  "displayName": "John Doe"
}

// Response:
{
  "id": 2,
  "email": "editor@example.com",
  "role": "editor",
  "displayName": "John Doe",
  "isActive": true
}

// Validation:
// - Email must be unique
// - Password min 8 chars
// - Role must be: admin, editor, viewer
// - Display name required
```

#### 3. Update User

**Endpoint**: `PATCH /api/admin/users/:id`
**Permission**: Admin only (users can update own displayName)
**File**: `functions/api/admin/users/[id].js`

```javascript
// Request:
{
  "role": "admin",          // optional
  "displayName": "New Name", // optional
  "isActive": false         // optional
}

// Response:
{
  "id": 2,
  "email": "editor@example.com",
  "role": "admin",
  "displayName": "New Name",
  "isActive": false
}
```

#### 4. Delete User

**Endpoint**: `DELETE /api/admin/users/:id`
**Permission**: Admin only
**File**: `functions/api/admin/users/[id].js`

```javascript
// Request: None
// Response:
{
  "success": true,
  "message": "User deleted successfully"
}

// Business Rules:
// - Cannot delete yourself
// - Cannot delete last admin user
// - Soft delete: set is_active = 0
```

#### 5. Get Audit Log

**Endpoint**: `GET /api/admin/audit-log`
**Permission**: Admin only
**File**: `functions/api/admin/audit-log.js`

```javascript
// Request query params:
// ?user_id=1&limit=50&offset=0

// Response:
{
  "logs": [
    {
      "id": 123,
      "userId": 1,
      "userEmail": "admin@example.com",
      "action": "user.created",
      "resourceType": "user",
      "resourceId": 2,
      "details": {"email": "editor@example.com"},
      "ipAddress": "192.168.1.1",
      "createdAt": "2025-11-11T..."
    }
  ],
  "total": 500,
  "limit": 50,
  "offset": 0
}
```

---

## Middleware Updates

### File: `functions/_middleware.js`

```javascript
// ADD: Role checking middleware

export async function checkPermission(request, env, requiredRole) {
  const token = getCookie(request.headers.get("Cookie"), "admin_token");
  if (!token) {
    return new Response("Unauthorized", { status: 401 });
  }

  const payload = await verifyJWT(token, env.JWT_SECRET);
  const userRole = payload.role;

  // Role hierarchy: admin > editor > viewer
  const roleHierarchy = { admin: 3, editor: 2, viewer: 1 };

  if (roleHierarchy[userRole] < roleHierarchy[requiredRole]) {
    return new Response("Forbidden", { status: 403 });
  }

  request.user = payload; // Attach user to request
  return null; // Permission granted
}

export async function auditLog(
  env,
  userId,
  action,
  resourceType,
  resourceId,
  details,
  ipAddress,
) {
  await env.DB.prepare(
    `
    INSERT INTO audit_log (user_id, action, resource_type, resource_id, details, ip_address)
    VALUES (?, ?, ?, ?, ?, ?)
  `,
  )
    .bind(
      userId,
      action,
      resourceType,
      resourceId,
      JSON.stringify(details),
      ipAddress,
    )
    .run();
}
```

### Update All Protected Endpoints

**Files to Update**:

- `functions/api/admin/events.js`
- `functions/api/admin/bands.js`
- `functions/api/admin/venues.js`

```javascript
// BEFORE:
export async function onRequest(context) {
  // auth check
  // execute action
}

// AFTER:
export async function onRequest(context) {
  const { request, env } = context;

  // Check permission based on HTTP method
  let requiredRole = "viewer";
  if (request.method === "POST" || request.method === "PATCH") {
    requiredRole = "editor";
  } else if (request.method === "DELETE") {
    requiredRole = "admin";
  }

  const permError = await checkPermission(request, env, requiredRole);
  if (permError) return permError;

  // Execute action with request.user available

  // Log action
  await auditLog(
    env,
    request.user.userId,
    "event.created",
    "event",
    eventId,
    {},
    getIP(request),
  );
}
```

---

## Frontend Components

### 1. User Management Tab

**File**: `frontend/src/admin/UsersTab.jsx`

```jsx
// Props: None
// State:
// - users: Array of user objects
// - loading: boolean
// - showModal: boolean
// - editingUser: User object or null

// Features:
// - List all users in table
// - Show role badges (color-coded)
// - Show active/inactive status
// - Actions: Edit, Activate/Deactivate, Delete
// - "Add User" button opens modal
// - Delete confirmation dialog
// - Cannot delete self
// - Cannot delete last admin

// Table columns:
// | Email | Display Name | Role | Status | Last Login | Actions |

// API calls:
// - GET /api/admin/users (on mount)
// - POST /api/admin/users (create)
// - PATCH /api/admin/users/:id (update)
// - DELETE /api/admin/users/:id (delete)
```

### 2. User Form Modal

**File**: `frontend/src/admin/UserFormModal.jsx`

```jsx
// Props:
// - isOpen: boolean
// - onClose: function
// - user: User object (null for create)
// - onSave: function(userData)

// Form fields:
// - Email (text input, required, disabled if editing)
// - Password (password input, required if creating, optional if editing)
// - Display Name (text input, required)
// - Role (select: admin, editor, viewer, required)
// - Active (checkbox, default true)

// Validation:
// - Email format check
// - Password min 8 chars
// - Display name min 2 chars

// UI:
// - Modal dialog (Tailwind modal)
// - Form with validation errors
// - Save/Cancel buttons
// - Loading state during save
```

### 3. Role Badge Component

**File**: `frontend/src/admin/RoleBadge.jsx`

```jsx
// Props:
// - role: string ('admin', 'editor', 'viewer')

// Styling:
// - admin: bg-red-100 text-red-800
// - editor: bg-blue-100 text-blue-800
// - viewer: bg-gray-100 text-gray-800
// - Pill shape with padding
```

### 4. Current User Display

**File**: `frontend/src/admin/CurrentUserDisplay.jsx`

```jsx
// Props: None
// State: currentUser from JWT token

// Features:
// - Show in top-right of admin header
// - Display: "John Doe (Admin)"
// - Dropdown menu:
//   - Profile (shows user info)
//   - Change Password
//   - Logout

// Position: Absolute top-right of AdminApp header
```

### 5. Permission Guard HOC

**File**: `frontend/src/admin/PermissionGuard.jsx`

```jsx
// Usage:
// <PermissionGuard requiredRole="admin">
//   <AdminOnlyComponent />
// </PermissionGuard>

// Behavior:
// - Check JWT token for user role
// - Compare against requiredRole
// - Show children if permitted
// - Show "Access Denied" message if not
// - Redirect to dashboard if not admin viewing users

// Role hierarchy: admin > editor > viewer
```

---

## Testing Specifications

### Unit Tests

**File**: `tests/functions/api/admin/users.test.js`

```javascript
// Test cases:
describe("User Management API", () => {
  describe("GET /api/admin/users", () => {
    it("should return all users for admin", async () => {});
    it("should return 403 for editor", async () => {});
    it("should return 403 for viewer", async () => {});
  });

  describe("POST /api/admin/users", () => {
    it("should create user with valid data", async () => {});
    it("should reject duplicate email", async () => {});
    it("should reject invalid role", async () => {});
    it("should hash password", async () => {});
    it("should return 403 for non-admin", async () => {});
  });

  describe("PATCH /api/admin/users/:id", () => {
    it("should update user role", async () => {});
    it("should update display name", async () => {});
    it("should activate/deactivate user", async () => {});
    it("should prevent non-admin updates", async () => {});
  });

  describe("DELETE /api/admin/users/:id", () => {
    it("should soft delete user", async () => {});
    it("should prevent deleting self", async () => {});
    it("should prevent deleting last admin", async () => {});
  });
});
```

### Integration Tests

**File**: `tests/integration/rbac.test.js`

```javascript
// Test scenarios:
describe("RBAC Integration", () => {
  it("should enforce permissions on event creation", async () => {
    // Editor can create
    // Viewer cannot create
  });

  it("should enforce permissions on event deletion", async () => {
    // Admin can delete
    // Editor cannot delete
  });

  it("should log all admin actions", async () => {
    // Create user
    // Check audit log
  });

  it("should prevent privilege escalation", async () => {
    // Editor tries to make self admin
    // Should fail
  });
});
```

---

## Acceptance Criteria

### Backend

- [ ] Users table created with migration
- [ ] Audit log table created
- [ ] All 5 user management endpoints working
- [ ] Middleware enforces permissions on all admin endpoints
- [ ] Audit logging on create/update/delete actions
- [ ] Cannot delete self or last admin
- [ ] Password hashing with bcrypt
- [ ] JWT includes role and displayName

### Frontend

- [ ] Users tab in admin panel
- [ ] User list table with all columns
- [ ] Create user modal with validation
- [ ] Edit user modal (pre-filled)
- [ ] Delete confirmation dialog
- [ ] Role badges color-coded
- [ ] Current user display in header
- [ ] Permission guards hide/show UI elements
- [ ] Access denied message for forbidden actions

### Security

- [ ] Role hierarchy enforced (admin > editor > viewer)
- [ ] Viewers cannot modify data
- [ ] Editors cannot delete or manage users
- [ ] Only admins can manage users
- [ ] Audit log tracks all sensitive actions
- [ ] Cannot bypass permissions with direct API calls

### Testing

- [ ] Unit tests for all API endpoints (80%+ coverage)
- [ ] Integration tests for RBAC scenarios
- [ ] Manual test: Create/edit/delete users
- [ ] Manual test: Login as each role, verify permissions
- [ ] Manual test: Audit log shows correct entries

---

## Implementation Order

1. **Database** (30 min)
   - Create migration file
   - Run migration locally
   - Verify tables created

2. **Middleware** (1 hour)
   - Add permission checking functions
   - Add audit logging function
   - Update JWT payload

3. **User API** (3 hours)
   - List users endpoint
   - Create user endpoint
   - Update user endpoint
   - Delete user endpoint
   - Audit log endpoint

4. **Update Existing APIs** (2 hours)
   - Add permission checks to events
   - Add permission checks to bands
   - Add permission checks to venues
   - Add audit logging

5. **Frontend Components** (4 hours)
   - UsersTab component
   - UserFormModal component
   - RoleBadge component
   - CurrentUserDisplay component
   - PermissionGuard HOC

6. **Testing** (2 hours)
   - Write unit tests
   - Write integration tests
   - Manual testing of all scenarios

**Total Estimate**: 12-14 hours (1.5-2 days with interruptions)

---

## Handoff Notes for Cursor/Copilot

### Start Here:

1. Create `migrations/legacy/001_add_rbac.sql` with schema above
2. Run migration: `sqlite3 .wrangler/state/v3/d1/*.sqlite < migrations/legacy/001_add_rbac.sql`
3. Create `functions/api/admin/users.js` with all CRUD operations
4. Update `functions/_middleware.js` with permission functions
5. Create `frontend/src/admin/UsersTab.jsx` component
6. Add Users tab to admin navigation

### Key Files to Create:

- `migrations/legacy/001_add_rbac.sql`
- `functions/api/admin/users.js`
- `functions/api/admin/users/[id].js`
- `functions/api/admin/audit-log.js`
- `frontend/src/admin/UsersTab.jsx`
- `frontend/src/admin/UserFormModal.jsx`
- `frontend/src/admin/RoleBadge.jsx`
- `frontend/src/admin/CurrentUserDisplay.jsx`
- `frontend/src/admin/PermissionGuard.jsx`
- `tests/functions/api/admin/users.test.js`

### Key Files to Update:

- `functions/_middleware.js` (add permission checking)
- `functions/api/admin/events.js` (add permission checks)
- `functions/api/admin/bands.js` (add permission checks)
- `functions/api/admin/venues.js` (add permission checks)
- `frontend/src/admin/AdminApp.jsx` (add Users tab)

### Dependencies:

- bcryptjs (password hashing) - already installed
- JWT library - already in use
- No new npm packages needed

---

## Questions/Clarifications Needed

1. Should users be able to change their own passwords?
2. Should there be password reset functionality?
3. Should emails be sent when users are created?
4. Should there be user invitation flow instead of direct creation?

**Default Answers** (proceed with these if not specified):

1. Yes, add "Change Password" to user dropdown
2. Not for demo (defer to post-demo)
3. No (defer to post-demo)
4. No, direct creation is fine for demo
