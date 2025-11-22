# SetTimes Demo Backup Plan
**Emergency Procedures for November 30th Demo**

---

## 🚨 When to Use This Plan

**Activate backup plan if:**
- Internet connection fails
- Database is unreachable
- Site won't load (500 errors, timeout)
- Critical bugs appear during demo
- Any issue lasting >30 seconds

**Don't waste time debugging live.** Switch to backup immediately.

---

## 📋 Backup Option Hierarchy

### Option 1: Pre-Recorded Video (Best)

**When to use:** Complete system failure, no internet

**Location:**
- `docs/demo-assets/settimes-demo-recording.mp4`
- Also on USB drive as backup

**Duration:** 15 minutes (covers full demo script)

**How to use:**
1. Apologize briefly: "Let me show you a recording of the system"
2. Play video
3. Pause at key moments to provide commentary
4. Answer questions after

**Advantages:**
- Shows full functionality
- No technical issues
- Smooth experience
- Still impressive

**Disadvantages:**
- Less interactive
- No live feel

---

### Option 2: Screenshot Walkthrough (Good)

**When to use:** Internet down, video won't play

**Location:**
- `docs/demo-assets/screenshots/` (20+ images)
- Numbered 01-20 in demo order
- Also printed as handouts (if presenting in person)

**How to use:**
1. Open screenshot folder in file browser
2. Full screen mode (F11)
3. Click through images in order
4. Narrate each screenshot
5. Reference printed handouts if available

**Screenshot List:**
1. `01-public-timeline.png` - Homepage with event
2. `02-event-detail.png` - Spring Music Festival card
3. `03-venue-filter.png` - Filtered by The Analog Cafe
4. `04-band-profile.png` - The Sunset Trio profile
5. `05-admin-login.png` - Login screen
6. `06-admin-dashboard.png` - Events tab overview
7. `07-context-banner.png` - Event context at top
8. `08-venues-tab.png` - Venue management
9. `09-create-venue-form.png` - Add venue form
10. `10-create-venue-success.png` - Success message
11. `11-performers-tab.png` - Performer management
12. `12-create-performer-form.png` - Add performer form
13. `13-conflict-detection.png` - Scheduling conflict warning
14. `14-confirm-dialog.png` - Delete confirmation
15. `15-mobile-view.png` - iPhone viewport
16. `16-design-system.png` - UI components showcase
17. `17-tooltips.png` - Help tooltips visible
18. `18-rbac-viewer.png` - Viewer role (read-only)
19. `19-breadcrumbs.png` - Navigation breadcrumbs
20. `20-public-timeline-updated.png` - New band visible

**Advantages:**
- No internet required
- Easy to navigate
- Can go at own pace
- Printable for reference

**Disadvantages:**
- Less dynamic
- Manual narration required

---

### Option 3: Localhost Demo (If Internet Fails)

**When to use:** Internet down but computer working

**Prerequisites:**
- Local development server running
- Local D1 database seeded with demo data
- Tested before presentation

**How to use:**
1. Apologize: "Internet is down, switching to local environment"
2. Open localhost: `http://localhost:5173`
3. Run through demo script normally
4. Mention: "This is the exact same code running locally"

**Setup (do before presentation):**
```bash
# Start dev server
cd frontend
npm run dev

# In another terminal, seed local DB
wrangler d1 execute settimes-db --local --file=../database/demo-data-seed.sql

# Verify working
# Open http://localhost:5173 in browser
```

**Advantages:**
- Full functionality
- Interactive live demo
- Shows it's real code

**Disadvantages:**
- Requires setup beforehand
- localhost URL looks unprofessional
- May have slight differences from production

---

### Option 4: Code Walkthrough (Last Resort)

**When to use:** Nothing else works, complete system failure

**How to use:**
1. Apologize: "Due to technical issues, let me walk you through the code"
2. Open code editor (VS Code)
3. Show key files and explain architecture
4. Reference documentation
5. Offer to schedule follow-up demo

**Files to show:**
- `frontend/src/admin/AdminPanel.jsx` - Admin interface
- `frontend/src/components/ui/Button.jsx` - Design system
- `functions/api/admin/bands.js` - API endpoint
- `docs/USER_GUIDE.md` - Documentation quality

**Talking points:**
- Show code quality and organization
- Explain architecture decisions
- Highlight security features in code
- Demonstrate comprehensive docs

**Advantages:**
- Shows technical competence
- Proves code exists and is quality
- Can still be impressive

**Disadvantages:**
- Not a visual demo
- Harder for non-technical audience
- Less engaging

---

## 🎬 Video Recording Checklist

**Before Demo Day:**
- [ ] Record full demo following script
- [ ] Include voiceover narration
- [ ] Edit for quality (remove mistakes)
- [ ] Export as MP4 (H.264, 1080p)
- [ ] Test playback on demo computer
- [ ] Copy to USB drive backup
- [ ] Upload to cloud backup (Google Drive, Dropbox)

**Recording Tips:**
- Use OBS Studio or Loom
- 1920x1080 resolution minimum
- Clear audio (use good microphone)
- Slow down cursor movements
- Highlight clicks with cursor effect
- Add subtle background music (optional)
- 15-minute duration max

---

## 📸 Screenshot Capture Checklist

**Before Demo Day:**
- [ ] Capture all 20 screenshots from script
- [ ] Use consistent browser size (1920x1080)
- [ ] Hide personal information (if any)
- [ ] Number files clearly (01-20)
- [ ] Export as PNG (high quality)
- [ ] Print handouts (if in-person presentation)
- [ ] Copy to USB drive backup
- [ ] Test viewing in full screen

**Screenshot Tips:**
- Use Firefox/Chrome screenshot tools (Ctrl+Shift+S)
- Hide bookmarks bar
- Zoom to 100% (Ctrl+0)
- Clear, readable text
- Show complete UI (no cropping)

---

## 🔧 Pre-Demo Technical Checks

**1 Hour Before:**
- [ ] Test internet connection (speedtest.net)
- [ ] Verify site is accessible (https://settimes.ca)
- [ ] Test admin login works
- [ ] Verify demo data exists in database
- [ ] Check all demo URLs load
- [ ] Test video playback
- [ ] Open screenshots in file browser
- [ ] Close unnecessary apps
- [ ] Charge laptop fully
- [ ] Have power adapter connected

**10 Minutes Before:**
- [ ] Close all browser tabs except demo tabs
- [ ] Turn off notifications (Do Not Disturb mode)
- [ ] Close Slack, email, messaging apps
- [ ] Test internet one more time
- [ ] Have backup plan docs open on phone
- [ ] Set phone to silent
- [ ] Take deep breath and relax

---

## 🎯 Failure Scenarios & Responses

### Scenario 1: Site Won't Load

**Symptoms:** 500 error, timeout, DNS failure

**Response:**
1. Try refresh (F5) once
2. If still failing after 10 seconds, switch to **Option 1: Video**
3. Say: "Let me show you a recording while we troubleshoot"
4. Don't spend >30 seconds debugging

### Scenario 2: Login Fails

**Symptoms:** Invalid credentials, session errors

**Response:**
1. Try once more (might be typo)
2. If still failing, switch to **Option 2: Screenshots**
3. Say: "Let me walk you through using screenshots"
4. Show admin screenshots in sequence

### Scenario 3: Database Empty

**Symptoms:** No events showing, empty lists

**Response:**
1. Check URL (wrong environment?)
2. If database actually empty, switch to **Option 1: Video**
3. Say: "I have a full recording prepared showing the system with data"
4. After demo, investigate why seed script didn't run

### Scenario 4: Internet Drops Mid-Demo

**Symptoms:** Connection lost, pages won't load

**Response:**
1. Check connection (is WiFi connected?)
2. Switch to **Option 3: Localhost** if prepared
3. Otherwise switch to **Option 2: Screenshots**
4. Say: "Let me continue with local environment" or "Let me use screenshots"
5. Apologize briefly, move on quickly

### Scenario 5: Critical Bug Appears

**Symptoms:** JavaScript error, broken UI, wrong behavior

**Response:**
1. Don't try to fix it live
2. Acknowledge: "Interesting, I haven't seen that before"
3. Switch to **Option 1: Video** or **Option 2: Screenshots**
4. Say: "Let me show you the working version"
5. Note bug for post-demo investigation

### Scenario 6: Presenter Computer Crashes

**Symptoms:** Blue screen, kernel panic, total freeze

**Response:**
1. **If co-presenting:** Have backup person take over
2. **If solo:** Reboot immediately while apologizing
3. While rebooting, talk about architecture/features
4. If reboot >2 minutes, switch to **handout screenshots**
5. Offer to reschedule or send video recording

---

## 💡 Professional Responses to Failures

### What to Say

**Good responses:**
- ✅ "Let me show you the recorded version while we look into this"
- ✅ "I have screenshots prepared that show this perfectly"
- ✅ "This is unusual - let me switch to the backup demo"
- ✅ "The production environment seems to be having issues, let me use the local version"

**Avoid:**
- ❌ "I don't know what's wrong" (sounds unprepared)
- ❌ "This worked 5 minutes ago!" (sounds defensive)
- ❌ "Let me just debug this real quick" (wastes time)
- ❌ Long awkward silence while clicking around
- ❌ Blaming others ("IT must have broken it")

### Body Language

**Do:**
- Stay calm and professional
- Smile and maintain composure
- Make eye contact with audience
- Use confident hand gestures
- Continue speaking smoothly

**Don't:**
- Panic or show frustration
- Stare at screen silently
- Fidget nervously
- Apologize repeatedly
- Let silence hang

---

## 📞 Emergency Contacts

**Technical Support:**
- Your Name: [Your Phone]
- Backup Presenter: [Name & Phone]
- IT Support: [Contact]

**Have These Ready:**
- Phone with internet (hotspot backup)
- Secondary laptop with backup materials
- USB drive with video + screenshots
- Printed screenshots (if in-person)

---

## ✅ Post-Failure Actions

**After demo (if backup plan was used):**
1. **Investigate immediately:**
   - Check error logs
   - Test the failing component
   - Document what happened
   - Fix the issue

2. **Follow up with audience:**
   - Send email with working demo link
   - Offer to schedule 1-on-1 walkthroughs
   - Send video recording
   - Provide access to live system

3. **Learn from it:**
   - Update backup plan
   - Add more failsafes
   - Practice disaster scenarios
   - Improve preparation checklist

---

## 🎓 Practice Scenarios

**Before demo day, practice these:**

1. **Internet Failure Drill:**
   - Disable WiFi mid-demo
   - Switch to video within 10 seconds
   - Practice smooth transition

2. **Login Failure Drill:**
   - Use wrong password
   - Switch to screenshots
   - Continue narration smoothly

3. **Computer Crash Drill:**
   - Close all apps suddenly
   - Reboot and continue
   - Time how long recovery takes

**Goal:** Switching to backup should feel natural and smooth, not panicked.

---

## 🏆 Success Mindset

**Remember:**
- Backups are professional, not failures
- Every presenter has technical issues
- How you handle it matters more than the issue itself
- Audience wants you to succeed
- You're prepared and ready

**Before going on:**
- Take 3 deep breaths
- Review script one more time
- Check all backup materials are accessible
- Visualize successful demo
- Remember: You've practiced this

---

**You've got this! 🚀**

**The demo will be great. And if something goes wrong, you're prepared.**
