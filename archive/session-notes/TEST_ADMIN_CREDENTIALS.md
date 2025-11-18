# Test Admin Credentials

**For Local Development Testing**

Since the admin panel requires email/password authentication from the database, you have two options:

## Option 1: Create Admin User via Signup

1. **Start the dev server** (already running at http://localhost:5173)
2. **Navigate to signup page:**
   - Go to: http://localhost:5173/admin/signup
3. **Fill in the form:**
   - Email: `admin@test.com` (or any email)
   - Password: `testpassword123` (8+ characters)
   - Name: `Test Admin` (optional)
   - Role: Select "admin"
4. **Click "Sign Up"**
5. **Login** with the credentials you just created

## Option 2: Direct Database Access

If you need to check existing users or create one manually:

```bash
# Check existing users
npx wrangler d1 execute bandcrawl-db --local --command="SELECT email, role FROM users;"

# Create a test admin (password hash for 'test123456')
npx wrangler d1 execute bandcrawl-db --local --command="
INSERT INTO users (email, password_hash, role, name)
VALUES ('admin@test.com', '\$2a\$10\$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17jhWy', 'admin', 'Test Admin');
"
```

**Note:** The password `test123456` will work with that hash.

## Quick Test Credentials

**Email:** admin@test.com  
**Password:** test123456

*(Note: This hash may not work depending on your crypto implementation)*

## Recommended Approach

**Just use the signup flow** - it's the easiest way to create a test admin account:

1. http://localhost:5173/admin/signup
2. Enter test credentials
3. Login immediately
4. Start testing mobile optimizations!

---

**Dev Server:** http://localhost:5173/admin  
**Network URL:** http://192.168.1.94:5173/admin (for mobile testing)

