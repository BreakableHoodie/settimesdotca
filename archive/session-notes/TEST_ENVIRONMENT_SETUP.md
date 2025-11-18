# Test Environment Setup Instructions

**Date:** 2025-10-26  
**Purpose:** Test mobile optimizations on real devices

---

## 🚀 Quick Start

### 1. Start Frontend Dev Server

The dev server is already running! You can access it at:

- **Local:** http://localhost:5173/
- **Network:** http://192.168.1.94:5173/ (your IP may differ)

To restart manually:
```bash
cd frontend
npm run dev
```

### 2. Start Backend (Cloudflare Workers + D1)

For a complete test environment with API endpoints:

```bash
# Make sure you have .dev.vars configured (from the repo root)
npx wrangler pages dev dist --compatibility-date 2024-01-01
```

Or for a simpler approach (just frontend):
- The frontend dev server is sufficient for testing UI changes
- API calls will fail, but you can test the mobile layout

---

## 📱 Testing on Mobile Devices

### iPhone/iPad (Safari)

1. **Ensure your phone and computer are on the same WiFi network**
2. **Get your computer's IP address:**
   - Mac: `ipconfig getifaddr en0` or check the Network URL from Vite output
   - Look for "Network: http://192.168.x.x:5173" in the terminal
3. **On your iPhone:**
   - Open Safari
   - Navigate to: `http://YOUR_IP:5173`
   - Example: `http://192.168.1.94:5173`
4. **Access Admin Panel:**
   - Go to: `http://YOUR_IP:5173/admin`
   - Login with your admin credentials

### Android (Chrome)

1. Same WiFi network
2. Get your computer's IP (see above)
3. Open Chrome on Android
4. Navigate to: `http://YOUR_IP:5173/admin`
5. Login

### Without Backend API

If you just want to test UI/UX:
- The frontend will run fine
- API calls will fail (you'll see errors in console)
- You can test:
  - ✅ Button sizes and touch targets
  - ✅ Bottom navigation
  - ✅ Form input sizes
  - ✅ Layout responsiveness
  - ✅ Navigation flow

### With Full Backend

For complete testing:
```bash
# Terminal 1: Frontend
cd frontend
npm run dev

# Terminal 2: Backend (wrangler)
npx wrangler pages dev dist

# This runs everything at http://localhost:8788
```

---

## 🧪 What to Test

### Mobile Optimizations (Phase 1 & 2)

1. **Touch Targets (44-48px)**
   - ✅ All buttons feel easy to tap
   - ✅ No accidental taps on adjacent buttons
   - ✅ Text is readable without squinting

2. **Bottom Navigation**
   - ✅ Navigate between Events/Venues/Bands tabs
   - ✅ Active tab is highlighted in orange
   - ✅ Icons are clear and recognizable
   - ✅ Easy to reach with thumb

3. **Form Inputs**
   - ✅ Input fields don't zoom on focus (iOS)
   - ✅ Easy to type in form fields
   - ✅ Submit/Cancel buttons are large enough

4. **Overall Layout**
   - ✅ No horizontal scrolling
   - ✅ Content fits mobile screen width
   - ✅ Bottom nav doesn't cover important content
   - ✅ Toast notifications appear above bottom nav

### Test Workflow

1. **Login** - Test the admin login screen
2. **Create Event** - Test the Event Wizard
3. **Add Venues** - Test form inputs and buttons
4. **Add Bands** - Test the bands tab, form, and list
5. **Navigation** - Switch between tabs using bottom nav
6. **Responsive** - Rotate device to test landscape mode

---

## 🔧 Troubleshooting

### "Can't connect to dev server"

**Solution:** Make sure both devices are on the same WiFi network
```bash
# Check your IP address
ifconfig | grep "inet "
```

### "API calls failing"

**Solution:** You're testing frontend only. Options:
1. Start the full backend with Wrangler (see above)
2. Ignore API errors and just test UI/UX
3. Use browser DevTools Network tab to see what's failing

### "Page won't load on mobile"

**Solution:**
- Try the network URL instead of localhost
- Check firewall settings
- Ensure Vite dev server is accessible from network

### "Bottom nav not showing"

**Solution:** 
- Bottom nav only appears on mobile viewport (<768px width)
- Resize browser DevTools to mobile size
- Or test on actual device (recommended)

---

## 📊 Network URLs

Your dev server is accessible at:
- Local: `http://localhost:5173/`
- Network: `http://192.168.1.94:5173/` (may vary)

Use the **Network** URL on your mobile device.

---

## ✅ Quick Test Checklist

- [ ] Open http://YOUR_IP:5173/admin on mobile
- [ ] Test login flow
- [ ] Check bottom navigation works
- [ ] Tap on "Create Event" - should be easy
- [ ] Fill in a form - inputs shouldn't zoom
- [ ] Switch between tabs - bottom nav should work
- [ ] Test Edit/Delete buttons - should be tappable
- [ ] Rotate device - layout should adapt
- [ ] Check no horizontal scrolling

---

## 🎯 Next Steps After Testing

1. **Provide feedback** - What's awkward? What's good?
2. **Fix issues** - If something doesn't work well
3. **Continue optimization** - Phase 3-6 (swipe gestures, documentation)
4. **Deploy** - Once satisfied, deploy to staging

---

**Current Status:** Dev server running at http://localhost:5173/
**Test URL:** http://192.168.1.94:5173/admin (use your network IP)
**Mobile Access:** Connect device to same WiFi and use Network URL

