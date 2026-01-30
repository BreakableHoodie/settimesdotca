# SetTimes Demo Testing Checklist
**Pre-Demo Quality Assurance**

**Goal:** Test demo flow 3+ times to ensure flawless presentation

**Note:** Local passwords are set by `scripts/setup-local-db.sh` (or via `LOCAL_*_PASSWORD` env vars). Use the values printed during setup.
**Deadline:** Before November 30, 2025

---

## 📋 Testing Round Structure

**Complete 3 full rounds minimum:**
- ✅ Round 1: Slow and methodical (find issues)
- ✅ Round 2: At presentation pace (timing)
- ✅ Round 3: Full dress rehearsal (confidence)

**Each round:** 20-25 minutes including setup

---

## 🔧 Pre-Testing Setup

**Environment Preparation:**
- [ ] Seed demo database with `demo-data-seed.sql`
- [ ] Verify all 18 bands appear
- [ ] Verify all 5 venues appear
- [ ] Verify event "Spring Music Festival 2025" exists and is published
- [ ] Clear browser cache
- [ ] Close all unnecessary apps
- [ ] Turn off notifications
- [ ] Have demo script open on second monitor/phone

**User Accounts:**
- [ ] Test admin login: `admin@settimes.ca` / `LOCAL_ADMIN_PASSWORD`
- [ ] Test editor login: `editor@settimes.ca` / `LOCAL_EDITOR_PASSWORD`
- [ ] Test viewer login: `viewer@settimes.ca` / `LOCAL_VIEWER_PASSWORD`

**URLs to Test:**
- [ ] `https://settimes.ca` (public timeline)
- [ ] `https://settimes.ca/admin` (admin panel)
- [ ] `https://settimes.ca/bands/spring-music-fest-2025/the-sunset-trio` (band profile)

---

## ✅ Testing Round 1: Methodical Discovery

**Goal:** Find all potential issues

### Part 1: Public Timeline

- [ ] Navigate to `https://settimes.ca`
- [ ] Page loads within 2 seconds
- [ ] Event "Spring Music Festival 2025" is visible
- [ ] Event card shows correct date: May 17, 2025
- [ ] Event card shows performer count: 18 performers
- [ ] Event card shows venue count: 5 venues
- [ ] All 18 bands are listed
- [ ] Band names are readable and formatted correctly
- [ ] Venue names appear correctly
- [ ] Times are formatted correctly (HH:MM or 12-hour with AM/PM)
- [ ] No JavaScript errors in console (F12)
- [ ] No missing images or broken icons
- [ ] Mobile view looks good (toggle device toolbar)

**Filtering:**
- [ ] Click on "The Analog Cafe" venue filter
- [ ] Only 3 bands appear (The Sunset Trio, Electric Dreams, Northern Lights)
- [ ] Filter button shows active state
- [ ] Click "Clear filters" or filter again
- [ ] All 18 bands reappear
- [ ] No console errors during filtering

**Band Profiles:**
- [ ] Click on "The Sunset Trio"
- [ ] Page loads: `/bands/spring-music-fest-2025/the-sunset-trio`
- [ ] Band name appears as header
- [ ] Description is visible and readable
- [ ] Performance time shows correctly
- [ ] Venue name appears: "The Analog Cafe"
- [ ] Social media links work (Instagram, Facebook if present)
- [ ] "Back to schedule" or navigation works
- [ ] No 404 errors
- [ ] Page is mobile-responsive

**Repeat for 2 more bands:**
- [ ] Test band with no social media links
- [ ] Test band at different venue

### Part 2: Admin Login

- [ ] Navigate to `https://settimes.ca/admin`
- [ ] Login form appears
- [ ] Enter email: `editor@settimes.ca`
- [ ] Enter password: `LOCAL_EDITOR_PASSWORD`
- [ ] Click "Sign In" button
- [ ] Redirects to admin dashboard (no errors)
- [ ] Dashboard loads correctly
- [ ] User name appears in header or menu
- [ ] Three tabs visible: Events, Venues, Performers
- [ ] Context banner appears if event selected
- [ ] No console errors

### Part 3: Admin Dashboard Navigation

**Events Tab:**
- [ ] Click on 📅 Events tab
- [ ] All events listed (at least Spring Music Festival)
- [ ] Event shows correct status badge (Published)
- [ ] Event shows correct date
- [ ] Event shows band count
- [ ] "Create Event" button visible
- [ ] Edit/Delete buttons visible (if editor/admin)

**Venues Tab:**
- [ ] Click on 📍 Venues tab
- [ ] All 5 venues listed alphabetically or by creation
- [ ] Venue names correct
- [ ] Addresses appear (if provided)
- [ ] Band counts appear next to venues
- [ ] "Add Venue" button visible
- [ ] Edit/Delete buttons visible

**Performers Tab:**
- [ ] Click on 🎸 Performers tab
- [ ] All 18 bands listed
- [ ] Bands sorted by time or venue
- [ ] Each band shows:
  - Name
  - Venue
  - Start/end time
  - Event association
- [ ] "Add Performer" button visible
- [ ] Edit/Delete buttons visible

### Part 4: Creating New Venue

- [ ] Go to Venues tab
- [ ] Click "Add Venue" button
- [ ] Form modal/page opens
- [ ] Fill in fields:
  - Name: "The Jazz Lounge"
  - Address: "999 Yonge Street, Toronto, ON"
  - Website: "https://jazzlounge.ca"
  - Instagram: "jazzloungeto"
- [ ] Tooltips appear on hover (? icons)
- [ ] Click "Save Venue" button
- [ ] Loading spinner appears briefly
- [ ] Success message appears (green alert)
- [ ] Venue appears in venues list
- [ ] No console errors
- [ ] Form closes/clears

**Validation Testing:**
- [ ] Try to create venue without name (should fail)
- [ ] Error message appears clearly
- [ ] Form doesn't submit
- [ ] Error clears when name added

### Part 5: Creating New Performer

- [ ] Go to Performers tab
- [ ] Click "Add Performer" button
- [ ] Form opens
- [ ] Fill in fields:
  - Band Name: "The Blue Notes"
  - Event: "Spring Music Festival 2025" (dropdown)
  - Venue: "The Jazz Lounge" (dropdown)
  - Start Time: "20:00"
  - End Time: "21:00"
  - Description: "Smooth jazz quartet"
  - Instagram: "thebluenotes"
- [ ] Dropdowns work correctly
- [ ] Time inputs accept HH:MM format
- [ ] Click "Save Performer"
- [ ] Success message appears
- [ ] Band appears in performers list
- [ ] No console errors

**Validation Testing:**
- [ ] Try to create with end time before start time
- [ ] Error message appears: "End time must be after start time"
- [ ] Form doesn't submit
- [ ] Fix time and submit successfully

### Part 6: Conflict Detection

- [ ] Click "Add Performer" again
- [ ] Fill in conflicting band:
  - Band Name: "Conflict Test Band"
  - Event: "Spring Music Festival 2025"
  - Venue: "The Jazz Lounge"
  - Start Time: "20:30" (overlaps with The Blue Notes)
  - End Time: "21:30"
- [ ] Click "Save Performer"
- [ ] Band is created (conflicts don't prevent creation)
- [ ] **Warning appears:** "This band overlaps with 1 other band(s)"
- [ ] Conflicting band shown: "The Blue Notes (20:00 - 21:00)"
- [ ] Warning styled in red/orange
- [ ] Can see conflict details

**Cleanup:**
- [ ] Delete "Conflict Test Band"
- [ ] Click delete/trash icon
- [ ] Confirmation dialog appears
- [ ] Dialog shows band name
- [ ] Confirm deletion
- [ ] Band removed from list
- [ ] Success message appears

### Part 7: Mobile Responsiveness

- [ ] Open DevTools (F12)
- [ ] Toggle device toolbar (Ctrl+Shift+M)
- [ ] Select "iPhone 12 Pro" or similar
- [ ] Navigate through all tabs
- [ ] Bottom navigation appears on mobile
- [ ] All buttons are tappable (44px minimum)
- [ ] Forms are usable
- [ ] Text is readable without zoom
- [ ] No horizontal scrolling
- [ ] Images/icons scale correctly

### Part 8: RBAC Testing

**As Viewer:**
- [ ] Log out
- [ ] Log in as: `viewer@settimes.ca` / `LOCAL_VIEWER_PASSWORD`
- [ ] Go to Venues tab
- [ ] "Add Venue" button is disabled or hidden
- [ ] Edit buttons are disabled or hidden
- [ ] Delete buttons are disabled or hidden
- [ ] Can view all data (read-only)
- [ ] No console errors

**As Admin:**
- [ ] Log out
- [ ] Log in as: `admin@settimes.ca` / `LOCAL_ADMIN_PASSWORD`
- [ ] All buttons enabled
- [ ] Can access user management (if UI exists)
- [ ] Can delete venues
- [ ] Can edit events
- [ ] Full permissions verified

### Part 9: Public Timeline Update

- [ ] Log out or open incognito window
- [ ] Navigate to `https://settimes.ca`
- [ ] Find "Spring Music Festival 2025"
- [ ] Look for "The Blue Notes" at "The Jazz Lounge"
- [ ] Band appears in schedule (may take 1-5 minutes for cache)
- [ ] Click on "The Blue Notes"
- [ ] Band profile page loads
- [ ] All information correct
- [ ] Social links work

### Part 10: Error Handling

**404 Pages:**
- [ ] Navigate to `/bands/invalid-event/invalid-band`
- [ ] 404 page appears (not blank screen)
- [ ] Error message is friendly
- [ ] Link back to home works

**Invalid URLs:**
- [ ] Try various broken URLs
- [ ] No white screen of death
- [ ] Error pages are styled

---

## ✅ Testing Round 2: Presentation Pace

**Goal:** Test at actual demo pace, verify timing

**Run through complete demo script:**
- [ ] Follow `DEMO_SCRIPT.md` exactly
- [ ] Time each section
- [ ] Verify total time: 15-20 minutes
- [ ] Note any sections that feel rushed
- [ ] Note any sections that drag
- [ ] Adjust script timing if needed

**Specific Checks:**
- [ ] Transitions between sections are smooth
- [ ] No awkward pauses waiting for pages to load
- [ ] Mouse movements are smooth (not frantic)
- [ ] Narration matches what's on screen
- [ ] No missed steps in script

**Take Notes:**
- [ ] What worked well?
- [ ] What felt awkward?
- [ ] Any technical delays?
- [ ] Script adjustments needed?

---

## ✅ Testing Round 3: Full Dress Rehearsal

**Goal:** Simulate real presentation conditions

**Setup:**
- [ ] Clear database and reseed fresh
- [ ] Close all apps like it's demo day
- [ ] Turn off notifications
- [ ] Set timer for 20 minutes
- [ ] Pretend you're presenting to audience

**Full Rehearsal:**
- [ ] Stand up and present out loud
- [ ] Speak as if audience is present
- [ ] Make eye contact with imaginary audience
- [ ] Use hand gestures
- [ ] Explain each action as you do it
- [ ] Handle transitions smoothly
- [ ] Stay within 20-minute time limit

**Check Confidence:**
- [ ] Did you stumble on any sections?
- [ ] Did you forget any key talking points?
- [ ] Did technical issues surprise you?
- [ ] Do you feel confident?

**If NOT confident:**
- [ ] Do additional rehearsal
- [ ] Revise script
- [ ] Practice problematic sections
- [ ] Test backup plan procedures

---

## 🐛 Bug Tracking

**If you find bugs during testing:**

| Bug | Severity | Section | Status | Fix |
|-----|----------|---------|--------|-----|
| Example: Venue filter not clearing | P2 | Public Timeline | Fixed | Clear button now works |
| | | | | |
| | | | | |

**Severity Levels:**
- **P0 (Critical):** Breaks demo, must fix before demo day
- **P1 (High):** Noticeable issue, should fix if possible
- **P2 (Medium):** Minor issue, can work around
- **P3 (Low):** Cosmetic issue, ignore for demo

**For P0 bugs:** Stop testing, fix immediately, re-test from Round 1

---

## 📊 Performance Benchmarks

**Measure these during testing:**

| Metric | Target | Actual | Pass/Fail |
|--------|--------|--------|-----------|
| Public timeline load | < 2s | | |
| Admin dashboard load | < 2s | | |
| Band profile load | < 1s | | |
| Create venue (API) | < 500ms | | |
| Create performer (API) | < 500ms | | |
| Filter venues | < 100ms | | |
| Page transitions | Smooth (60fps) | | |

**How to measure:**
- Use browser DevTools → Network tab
- Check "Disable cache"
- Refresh page and note load time
- Use Lighthouse for performance score

**Target Lighthouse Scores:**
- Performance: > 90
- Accessibility: > 90
- Best Practices: > 90
- SEO: > 90

---

## 🎯 Acceptance Criteria

**Demo is ready when:**
- [ ] All 3 testing rounds completed successfully
- [ ] No P0 bugs remaining
- [ ] < 3 P1 bugs remaining
- [ ] Timing is 15-20 minutes consistently
- [ ] Presenter feels confident
- [ ] Backup plan tested and ready
- [ ] All demo data seeds correctly
- [ ] Screenshots captured
- [ ] Video recording made
- [ ] Localhost demo works

---

## 📝 Final Pre-Demo Checklist

**24 Hours Before:**
- [ ] Complete all 3 testing rounds
- [ ] Fix all critical bugs
- [ ] Record backup video
- [ ] Capture all screenshots
- [ ] Print handouts (if in-person)
- [ ] Charge laptop fully
- [ ] Test on demo computer (if different from testing computer)

**1 Hour Before:**
- [ ] Seed database fresh
- [ ] Test all URLs one more time
- [ ] Verify internet connection
- [ ] Open demo tabs
- [ ] Close unnecessary apps
- [ ] Turn off notifications
- [ ] Have backup plan accessible
- [ ] Take a deep breath

---

## ✅ Sign-Off

**Testing Complete:**
- [ ] Round 1 completed: _____ (date/time)
- [ ] Round 2 completed: _____ (date/time)
- [ ] Round 3 completed: _____ (date/time)
- [ ] All P0 bugs fixed: _____ (date/time)
- [ ] Ready for demo: _____ (date/time)

**Tester Signature:**
- Name: _________________
- Date: _________________

---

**You've tested thoroughly. The demo will be excellent! 🚀**
