# Role-Based Access Control (RBAC) Model
**Pink Lemonade Records - Band Crawl Admin System**

## Role Hierarchy

### 1. Admin (Full Access)
**Permissions:**
- All editor permissions, plus:
- User management: invite users, change roles, deactivate accounts
- Password management: trigger password resets for any user
- System settings: modify global theme, configure site settings
- Audit access: view security logs, auth attempts
- Delete operations: can delete events, bands, venues

### 2. Editor (Content Management)
**Permissions:**
- Events: create, edit, publish/unpublish (cannot delete)
- Bands: create, edit, assign to venues (cannot delete)
- Venues: create, edit, update info (cannot delete)
- View-only user list (cannot modify users)
- Can see own profile and change own password

### 3. Read-Only (Viewer Access)
**Permissions:**
- View all events, bands, venues
- View schedules and analytics
- Export reports
- Cannot modify any data
- Can change own password only

## Middleware Permission Checks

**Endpoint-Level Protection:**
```javascript
// functions/api/admin/_middleware.js enforces authentication
// Individual endpoint handlers check role permissions

// Example:
if (context.data.user.role !== 'admin') {
  return new Response(JSON.stringify({
    error: 'Forbidden',
    message: 'Admin role required'
  }), { status: 403 })
}
```

## Permission Matrix

| Resource | Admin | Editor | Read-Only |
|----------|-------|--------|-----------|
| **Users** | | | |
| List users | ✅ | View only | ❌ |
| Invite user | ✅ | ❌ | ❌ |
| Change role | ✅ | ❌ | ❌ |
| Deactivate user | ✅ | ❌ | ❌ |
| Reset password (others) | ✅ | ❌ | ❌ |
| Change own password | ✅ | ✅ | ✅ |
| **Events** | | | |
| Create event | ✅ | ✅ | ❌ |
| Edit event | ✅ | ✅ | ❌ |
| Publish/unpublish | ✅ | ✅ | ❌ |
| Delete event | ✅ | ❌ | ❌ |
| View events | ✅ | ✅ | ✅ |
| **Bands** | | | |
| Create band | ✅ | ✅ | ❌ |
| Edit band | ✅ | ✅ | ❌ |
| Delete band | ✅ | ❌ | ❌ |
| Assign to venue | ✅ | ✅ | ❌ |
| View bands | ✅ | ✅ | ✅ |
| **Venues** | | | |
| Create venue | ✅ | ✅ | ❌ |
| Edit venue | ✅ | ✅ | ❌ |
| Delete venue | ✅ | ❌ | ❌ |
| View venues | ✅ | ✅ | ✅ |
| **Settings** | | | |
| Global theme | ✅ | ❌ | ❌ |
| Event theme | ✅ | ✅ | ❌ |
| Site config | ✅ | ❌ | ❌ |
| **Security** | | | |
| View audit logs | ✅ | ❌ | ❌ |
| View auth attempts | ✅ | ❌ | ❌ |
| Manage 2FA (own) | ✅ | ✅ | ✅ |

## Implementation Pattern

### Backend Endpoint Protection
```javascript
// functions/api/admin/users.js
export async function onRequestGet(context) {
  const { user } = context.data; // Set by middleware

  // Admin can see all users, editor can view only
  if (user.role === 'read-only') {
    return new Response(JSON.stringify({
      error: 'Forbidden'
    }), { status: 403 });
  }

  // Return user list...
}

export async function onRequestPost(context) {
  const { user } = context.data;

  // Only admin can create users
  if (user.role !== 'admin') {
    return new Response(JSON.stringify({
      error: 'Forbidden',
      message: 'Admin role required to manage users'
    }), { status: 403 });
  }

  // Create user...
}
```

### Frontend UI Control
```javascript
// frontend/src/admin/Dashboard.jsx
function Dashboard() {
  const user = adminApi.getCurrentUser();

  return (
    <>
      <h1>Admin Dashboard</h1>

      {/* Everyone can view */}
      <EventsList />

      {/* Only editors and admins can edit */}
      {['admin', 'editor'].includes(user.role) && (
        <Button onClick={handleCreateEvent}>Create Event</Button>
      )}

      {/* Only admins can delete */}
      {user.role === 'admin' && (
        <Button onClick={handleDeleteEvent}>Delete Event</Button>
      )}

      {/* Only admins see user management */}
      {user.role === 'admin' && (
        <Link to="/admin/users">Manage Users</Link>
      )}
    </>
  );
}
```

## First-Time Setup

**Initial Admin Creation:**
1. First signup automatically gets 'admin' role
2. Subsequent signups default to 'editor' role
3. Admins can then adjust roles as needed

**Migration Note:**
The `migration-2fa.sql` adds RBAC fields to support this model:
- `is_active`: Account status (1 = active, 0 = deactivated)
- `deactivated_at`: Timestamp of deactivation
- `deactivated_by`: Admin who deactivated the account

**Role Validation:**
- Enforce in backend (database constraints not possible in SQLite ALTER)
- Valid roles: 'admin', 'editor', 'read-only'
- Frontend validates on form submission
- Backend validates on all mutations

## Security Considerations

1. **Defense in Depth**: Check permissions at both frontend (UX) and backend (enforcement)
2. **Least Privilege**: Default to read-only, explicitly grant higher permissions
3. **Audit Trail**: Log all permission changes and sensitive operations
4. **Session Validation**: Middleware verifies role on every request
5. **Graceful Degradation**: If session expires, redirect to login (don't crash)

## Audit Log Events

**User Management:**
- `user_invited` - Admin invited new user
- `role_changed` - Admin changed user role
- `user_deactivated` - Admin deactivated account
- `password_reset_requested` - Admin triggered password reset

**All events logged to `auth_attempts` table:**
```sql
INSERT INTO auth_attempts (
  user_id, email, ip_address, user_agent,
  attempt_type, success, failure_reason
) VALUES (?, ?, ?, ?, ?, ?, ?);
```
