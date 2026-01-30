# SetTimes Troubleshooting Guide
**Common Issues and Solutions**

---

## Table of Contents

1. [Login & Authentication Issues](#login--authentication-issues)
2. [Event Management Issues](#event-management-issues)
3. [Venue Management Issues](#venue-management-issues)
4. [Performer Management Issues](#performer-management-issues)
5. [Publishing & Display Issues](#publishing--display-issues)
6. [Performance & Loading Issues](#performance--loading-issues)
7. [Mobile & Browser Issues](#mobile--browser-issues)
8. [API & Integration Issues](#api--integration-issues)
9. [Database & Data Issues](#database--data-issues)
10. [Security & Session Issues](#security--session-issues)

---

## Login & Authentication Issues

### "Invalid email or password"

**Problem:** Cannot log in to the admin panel.

**Solutions:**

1. **Check credentials:**
   - Email is case-sensitive
   - Password is case-sensitive
   - Ensure no extra spaces before/after

2. **Try password reset:**
   - Contact your administrator
   - Request password reset link

3. **Check account status:**
   - Account may be disabled
   - Contact administrator to verify

4. **Clear browser cache:**
   ```bash
   # Chrome/Edge: Ctrl+Shift+Delete
   # Firefox: Ctrl+Shift+Delete
   # Safari: Cmd+Opt+E
   ```

5. **Try incognito/private mode:**
   - Rules out browser extension conflicts
   - Tests with fresh session

**Still not working?** Contact support with your email address.

---

### "Session expired. Please log in again."

**Problem:** Logged out unexpectedly during work.

**Cause:** Session expired (default: 24 hours) or server restart.

**Solutions:**

1. **Log in again:**
   - Save any work in progress first
   - Re-authenticate at `/admin`

2. **Prevent in future:**
   - Don't leave admin panel idle for extended periods
   - Save work frequently
   - Consider adjusting session timeout (admin only)

**Note:** Session timeout is a security feature to protect your data.

---

### "Too many failed login attempts. Please try again later."

**Problem:** Account temporarily locked due to failed login attempts.

**Cause:** 5 failed login attempts within 10 minutes triggers 1-hour lockout.

**Solutions:**

1. **Wait 1 hour:**
   - Lockout automatically expires after 1 hour
   - Timer shown in error message

2. **Contact administrator:**
   - Admin can manually reset lockout
   - Requires database access

3. **Prevent in future:**
   - Use password manager to avoid typos
   - Ensure Caps Lock is off
   - Double-check email address

**Administrator Reset:**
```sql
-- Via wrangler CLI
wrangler d1 execute settimes-db --command="DELETE FROM auth_audit WHERE ip_address = 'XX.XX.XX.XX'"
```

---

## Event Management Issues

### "An event with this slug already exists"

**Problem:** Cannot create event with desired slug.

**Cause:** Event slugs must be unique across all events (published and drafts).

**Solutions:**

1. **Choose a different slug:**
   - `spring-fest` → `spring-fest-2025`
   - `vol-6` → `vol-6-december`
   - `music-crawl` → `music-crawl-downtown`

2. **Check existing events:**
   - Go to Events tab
   - Search for similar slugs
   - Delete or rename old event if no longer needed

3. **Use date suffix:**
   - Always include year: `event-name-2025`
   - Include month if multiple per year: `event-name-may-2025`

**Note:** Changing slugs after publishing breaks existing links. Choose carefully!

---

### "Cannot delete event - bands are assigned"

**Problem:** Event has bands assigned and cannot be deleted.

**Cause:** Foreign key constraint prevents orphaned band data.

**Solutions:**

1. **Delete all bands first:**
   - Go to Performers tab
   - Filter by event
   - Delete all performers
   - Then delete event

2. **Archive instead:**
   - Edit event
   - Uncheck "Published"
   - Mark as archived
   - Keeps historical data

**Administrator Alternative:**
```sql
-- WARNING: Deletes event and all bands (irreversible!)
DELETE FROM bands WHERE event_id = <event_id>;
DELETE FROM events WHERE id = <event_id>;
```

---

### "Date must be in YYYY-MM-DD format"

**Problem:** Event date validation error.

**Cause:** Invalid date format.

**Solutions:**

1. **Use correct format:**
   - ✅ Correct: `2025-05-17`
   - ❌ Wrong: `05/17/2025`
   - ❌ Wrong: `May 17, 2025`
   - ❌ Wrong: `17-05-2025`

2. **Use date picker:**
   - Click calendar icon
   - Select date visually
   - Auto-formats correctly

---

## Venue Management Issues

### "A venue with this name already exists"

**Problem:** Cannot create venue with duplicate name.

**Cause:** Venue names must be unique.

**Solutions:**

1. **Check existing venues:**
   - Go to Venues tab
   - Search for venue name
   - Use existing venue instead of creating duplicate

2. **Use slightly different name:**
   - `The Analog Cafe` → `Analog Cafe`
   - `Black Cat` → `Black Cat Tavern`
   - `Room 47` → `Room 47 Downtown`

3. **Edit existing venue:**
   - Update address or details
   - Rather than creating new one

**Best Practice:** Keep venue names consistent across all events.

---

### "Cannot delete venue with assigned performances"

**Problem:** Venue has bands assigned and cannot be deleted.

**Cause:** Foreign key constraint prevents orphaned band data.

**Solutions:**

1. **Reassign all bands:**
   - Go to Performers tab
   - Find all bands at this venue
   - Edit each band
   - Change venue to different one
   - Then delete venue

2. **Delete all bands:**
   - If bands no longer needed
   - Delete them first
   - Then delete venue

**Warning:** Deleting a venue used in multiple events affects all events!

---

## Performer Management Issues

### "The venue dropdown is empty"

**Problem:** Cannot add performer because no venues available.

**Cause:** No venues have been created yet.

**Solutions:**

1. **Add venues first:**
   - Go to Venues tab
   - Click "Add Venue"
   - Create at least one venue
   - Return to Performers tab

**Best Practice:** Always create events and venues before adding performers.

---

### "This band overlaps with X other band(s) at the same venue"

**Problem:** Scheduling conflict detected.

**Cause:** Two bands scheduled at same venue with overlapping times.

**Solutions:**

1. **Adjust times:**
   - Change start time to after previous band
   - Change end time to before next band
   - Leave 15-30 minute buffer between sets

2. **Change venue:**
   - Move band to different venue
   - Avoids conflict entirely

3. **Accept conflict (rare):**
   - Some events intentionally overlap
   - Multiple stages at same venue
   - Conflicts shown in red for review

**Example Conflict:**
```
Band A: 7:00 PM - 8:00 PM (Analog Cafe)
Band B: 7:30 PM - 8:30 PM (Analog Cafe) ❌ CONFLICT
```

**Fixed:**
```
Band A: 7:00 PM - 8:00 PM (Analog Cafe)
Band B: 8:30 PM - 9:30 PM (Analog Cafe) ✅ NO CONFLICT
```

---

### "End time must be after start time"

**Problem:** Invalid time range.

**Cause:** End time is before or equal to start time.

**Solutions:**

1. **Check AM/PM:**
   - `8:00 PM` → `20:00`
   - `9:00 AM` → `09:00`

2. **Use 24-hour format:**
   - Prevents AM/PM confusion
   - `20:00` to `21:00` (correct)
   - `08:00` to `09:00` (correct)

3. **Ensure logical order:**
   - Start: `19:00`
   - End: `20:00`
   - Duration: 1 hour ✅

---

### "Times must be in HH:MM format"

**Problem:** Time validation error.

**Cause:** Invalid time format.

**Solutions:**

1. **Use correct format:**
   - ✅ Correct: `19:00`
   - ✅ Correct: `08:30`
   - ❌ Wrong: `7:00` (missing leading zero)
   - ❌ Wrong: `19:00:00` (too many colons)
   - ❌ Wrong: `7pm` (not numeric)

2. **Use time picker:**
   - Click clock icon
   - Select time visually
   - Auto-formats correctly

---

## Publishing & Display Issues

### "My event isn't showing on the public timeline"

**Problem:** Event not visible on settimes.ca.

**Diagnostic Checklist:**

- [ ] Is the event **Published** (not Draft)?
- [ ] Is the event date in the future or recent past?
- [ ] Does the event have at least one band assigned?
- [ ] Have you waited 1-2 minutes for cache update?

**Solutions:**

1. **Publish the event:**
   - Go to Events tab
   - Click "Edit" on event
   - Check "Published" checkbox
   - Click "Save"

2. **Wait for cache update:**
   - Changes take 1-2 minutes to appear
   - Cloudflare cache TTL: 5 minutes
   - Refresh page after waiting

3. **Clear browser cache:**
   - Hard refresh: `Ctrl+Shift+R` (Windows) or `Cmd+Shift+R` (Mac)
   - Or try private/incognito window

4. **Check event date:**
   - Very old events may not appear
   - Check date is correct format

**Still not showing?** Check browser console for errors (F12).

---

### "Band profile page returns 404"

**Problem:** Band profile links show "Page Not Found".

**Cause:** URL format incorrect or band not properly assigned to event.

**Solutions:**

1. **Check URL format:**
   - Correct: `settimes.ca/bands/[event-slug]/[band-name-slug]`
   - Example: `settimes.ca/bands/spring-fest-2025/the-sunset-trio`

2. **Verify event is published:**
   - Band profiles only work for published events
   - Publish event first

3. **Check event slug:**
   - Must match event's slug exactly
   - Case-sensitive

4. **Check band is assigned to event:**
   - Go to Performers tab
   - Verify band has event association
   - Edit band if needed

5. **Wait for cache update:**
   - New bands take 1-2 minutes to appear
   - Clear browser cache

---

### "Changes aren't showing on public schedule"

**Problem:** Updates to events/bands not appearing.

**Cause:** Cloudflare cache or browser cache.

**Solutions:**

1. **Wait for cache expiration:**
   - Public API cached for 5 minutes
   - Wait 5 minutes for changes to appear

2. **Hard refresh browser:**
   - Windows/Linux: `Ctrl+Shift+R`
   - Mac: `Cmd+Shift+R`

3. **Clear Cloudflare cache (admin only):**
   - Cloudflare Dashboard → Caching
   - Purge Everything
   - Changes appear immediately

4. **Test in private window:**
   - Rules out local browser cache
   - Verifies backend changes

---

## Performance & Loading Issues

### "Admin panel is loading slowly"

**Problem:** Pages take a long time to load.

**Diagnostic Steps:**

1. **Check network speed:**
   - Run speed test: [fast.com](https://fast.com)
   - Minimum 1 Mbps recommended

2. **Check browser console:**
   - Press F12
   - Look for red errors
   - Screenshot errors for support

3. **Check number of records:**
   - Large events (100+ bands) may load slowly
   - Consider pagination (admin feature)

**Solutions:**

1. **Close unused tabs:**
   - Frees browser memory
   - Improves performance

2. **Clear browser cache:**
   - Removes old cached files
   - Forces fresh load

3. **Try different browser:**
   - Chrome (recommended)
   - Firefox
   - Safari
   - Edge

4. **Disable browser extensions:**
   - Ad blockers may interfere
   - Try incognito/private mode

---

### "Infinite loading spinner"

**Problem:** Page shows loading spinner indefinitely.

**Cause:** JavaScript error or network issue.

**Solutions:**

1. **Check browser console:**
   - Press F12
   - Look for red errors
   - Common: "Failed to fetch" or "CORS error"

2. **Refresh page:**
   - `Ctrl+R` or `Cmd+R`
   - Sometimes simple refresh fixes it

3. **Check internet connection:**
   - Test with other websites
   - Verify VPN isn't blocking

4. **Try different browser:**
   - Rules out browser-specific issues

5. **Contact support:**
   - Include browser console screenshot
   - Include browser name and version

---

## Mobile & Browser Issues

### "Buttons are hard to tap on mobile"

**Problem:** Buttons too small or miss-tap often.

**Note:** SetTimes uses 44x44px minimum touch targets (WCAG AAA compliance).

**Solutions:**

1. **Zoom in:**
   - Pinch to zoom on mobile
   - Buttons become easier to tap

2. **Use landscape orientation:**
   - More screen space
   - Larger buttons

3. **Update browser:**
   - Old browsers may not render correctly
   - Update to latest version

**Report Issue:** If buttons are genuinely too small, please report with screenshot.

---

### "Admin panel doesn't work on my phone"

**Problem:** Features not working on mobile device.

**Diagnostic Checklist:**

- [ ] Are you using a modern browser (Chrome, Safari, Firefox)?
- [ ] Is your browser up to date?
- [ ] Is JavaScript enabled?
- [ ] Do you have internet connection?

**Solutions:**

1. **Update browser:**
   - iOS: Update Safari via iOS update
   - Android: Update Chrome via Play Store

2. **Try different browser:**
   - Chrome (recommended for Android)
   - Safari (recommended for iOS)
   - Firefox

3. **Enable JavaScript:**
   - Required for SetTimes to function
   - Check browser settings

4. **Clear browser data:**
   - Settings → Privacy → Clear browsing data
   - Select "Cached images and files"

---

### "Safari won't let me log in"

**Problem:** Login fails on Safari (common issue).

**Cause:** Safari's strict cookie policies or cached data.

**Solutions:**

1. **Enable cross-site tracking:**
   - Settings → Safari → Privacy
   - Uncheck "Prevent Cross-Site Tracking"
   - Refresh page and try again

2. **Clear website data:**
   - Settings → Safari → Advanced → Website Data
   - Find settimes.ca
   - Swipe left and delete
   - Refresh and try again

3. **Try private browsing:**
   - Tap tabs button
   - Tap "Private"
   - Navigate to settimes.ca/admin

4. **Use Chrome instead:**
   - Download Chrome for iOS
   - Better compatibility

---

## API & Integration Issues

### "API returns 401 Unauthorized"

**Problem:** API requests failing with 401 status.

**Cause:** Missing or invalid authentication.

**Solutions:**

1. **Check session cookie:**
   - Ensure `credentials: 'include'` in fetch()
   - Session cookie must be present

2. **Re-authenticate:**
   - Call `/api/admin/auth/login` first
   - Obtain new session cookie
   - Retry API request

3. **Check cookie domain:**
   - Cookies only work on same domain
   - `settimes.ca` ≠ `www.settimes.ca`

**Example:**
```javascript
// Correct
fetch('https://settimes.ca/api/admin/events', {
  credentials: 'include' // Important!
})

// Wrong
fetch('https://settimes.ca/api/admin/events')
// Missing credentials - 401 error
```

---

### "API returns 403 CSRF validation failed"

**Problem:** POST/PUT/DELETE requests failing with 403.

**Cause:** Missing or invalid CSRF token.

**Solutions:**

1. **Include CSRF token:**
   ```javascript
   // Get CSRF token from cookie
   const csrfToken = document.cookie
     .split('; ')
     .find(row => row.startsWith('csrf_token='))
     .split('=')[1];

   // Include in request header
   fetch(url, {
     method: 'POST',
     headers: {
       'X-CSRF-Token': csrfToken
     },
     credentials: 'include'
   })
   ```

2. **Refresh CSRF token:**
   - Call `/api/admin/auth/login` to get new token
   - CSRF tokens expire with session

---

### "API returns 429 Too Many Requests"

**Problem:** Rate limited.

**Cause:** Exceeded rate limit (100 requests/minute).

**Solutions:**

1. **Wait before retrying:**
   - Check `X-RateLimit-Reset` header
   - Wait until reset time

2. **Implement exponential backoff:**
   ```javascript
   async function fetchWithRetry(url, options, retries = 3) {
     for (let i = 0; i < retries; i++) {
       const response = await fetch(url, options);
       if (response.status === 429) {
         // Wait 2^i seconds before retry
         await new Promise(resolve =>
           setTimeout(resolve, Math.pow(2, i) * 1000)
         );
         continue;
       }
       return response;
     }
   }
   ```

3. **Reduce request frequency:**
   - Cache responses client-side
   - Batch operations when possible
   - Don't poll more than necessary

---

## Database & Data Issues

### "Database error: Failed to fetch events"

**Problem:** 500 Internal Server Error.

**Cause:** Database connection issue or query error.

**Solutions (User):**

1. **Refresh page:**
   - Temporary glitch may resolve

2. **Try again later:**
   - Database may be under maintenance

3. **Contact administrator:**
   - Persistent errors need admin investigation

**Solutions (Administrator):**

1. **Check D1 database status:**
   ```bash
   wrangler d1 info settimes-db
   ```

2. **Check error logs:**
   ```bash
   wrangler tail --status error
   ```

3. **Verify database bindings:**
   - Check `wrangler.toml`
   - Ensure `DATABASE` binding exists

4. **Test database connection:**
   ```bash
   wrangler d1 execute settimes-db --command="SELECT 1"
   ```

---

### "Data appears corrupted or missing"

**Problem:** Events/venues/bands showing incorrect data.

**Cause:** Database corruption or accidental deletion.

**Solutions (Administrator):**

1. **Restore from backup:**
   ```bash
   wrangler d1 execute settimes-db --file=backups/settimes-20251119.sql
   ```

2. **Check audit logs:**
   ```sql
   SELECT * FROM audit_logs
   WHERE action LIKE '%delete%'
   ORDER BY created_at DESC LIMIT 50;
   ```

3. **Verify data integrity:**
   ```sql
   -- Check for orphaned bands
   SELECT b.* FROM bands b
   LEFT JOIN events e ON b.event_id = e.id
   WHERE e.id IS NULL;

   -- Check for orphaned venues
   SELECT v.* FROM venues v
   LEFT JOIN bands b ON v.id = b.venue_id
   WHERE b.id IS NULL AND v.created_at < datetime('now', '-30 days');
   ```

---

## Security & Session Issues

### "Suspicious activity detected"

**Problem:** Account flagged for unusual activity.

**Cause:** Multiple failed logins or unusual access patterns.

**Solutions:**

1. **Change password immediately:**
   - Contact administrator for password reset
   - Use strong, unique password

2. **Review audit logs:**
   - Check recent login attempts
   - Verify IP addresses are yours

3. **Enable 2FA (if available):**
   - Adds extra security layer

**Administrator Actions:**
```sql
-- View recent logins
SELECT * FROM audit_logs
WHERE action LIKE '%login%'
AND user_id = <user_id>
ORDER BY created_at DESC LIMIT 20;

-- Force logout all sessions
DELETE FROM sessions WHERE user_id = <user_id>;
```

---

### "CORS error in browser console"

**Problem:** Cross-origin request blocked.

**Cause:** API called from unauthorized origin.

**Solutions (Administrator):**

1. **Add origin to allowed list:**
   - Edit `functions/api/_middleware.js`
   - Add origin to CORS headers

2. **Check request origin:**
   ```javascript
   // Allowed origins
   const allowedOrigins = [
     'https://settimes.ca',
     'https://dev.settimes.ca',
     'http://localhost:5173'
   ];
   ```

**Note:** CORS is a security feature to prevent unauthorized API access.

---

## Getting Help

### Before Contacting Support

**Gather this information:**

1. **Error details:**
   - Exact error message
   - Screenshot of error
   - Browser console errors (F12)

2. **Environment:**
   - Browser name and version
   - Operating system
   - Device type (desktop/mobile/tablet)

3. **Steps to reproduce:**
   - What you were trying to do
   - Steps that led to error
   - When error first occurred

4. **Account info:**
   - Your email address
   - User role (admin/editor/viewer)
   - Event name (if applicable)

### Contact Support

**GitHub Issues:** [github.com/BreakableHoodie/settimesdotca/issues](https://github.com/BreakableHoodie/settimesdotca/issues)

**Include in your report:**
- Clear description of problem
- Steps to reproduce
- Expected vs actual behavior
- Screenshots or error messages
- Browser/device information

### Emergency Contacts

**Critical Issues (site down, data loss, security breach):**
1. Create urgent GitHub issue with `[URGENT]` prefix
2. Contact administrator directly
3. Do not share sensitive information publicly

---

## Appendix: Common Error Messages

| Error Message | Cause | Solution |
|---------------|-------|----------|
| "CSRF validation failed" | Missing CSRF token | Include X-CSRF-Token header |
| "Session expired" | Session timeout | Log in again |
| "Validation error" | Invalid input data | Check field requirements |
| "Slug already exists" | Duplicate slug | Use unique slug |
| "Event not found" | Invalid event ID | Verify event exists |
| "Unauthorized" | Not logged in | Log in first |
| "Forbidden" | Insufficient permissions | Contact admin for role upgrade |
| "Rate limited" | Too many requests | Wait and retry |
| "Database error" | Server issue | Retry or contact admin |

---

**Version:** 1.0
**Last Updated:** November 2025
**For:** SetTimes Platform (settimes.ca)

---

**Still stuck?** Don't hesitate to create a GitHub issue. We're here to help!
