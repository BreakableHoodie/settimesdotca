# Quick Start: Test Mobile Optimizations

**Dev server is running!**

## 📱 Access on Your Phone

1. **Get your computer's network IP** (shown in terminal):
   - Network: http://192.168.1.94:5173/

2. **On your phone** (same WiFi):
   - Open Safari or Chrome
   - Go to: `http://192.168.1.94:5173/admin/signup`
   - (Replace 192.168.1.94 with YOUR computer's IP)

3. **Create a test account:**
   - Email: `test@example.com`
   - Password: `test123456` (8+ characters)
   - Name: `Test Admin` (optional)
   - Click "Sign Up"

4. **You'll be automatically logged in!**
   - Start testing immediately
   - No backend needed for UI testing

## 🧪 What to Test

### Bottom Navigation
- ✅ See the bottom nav bar with icons (📅 📍 🎸)
- ✅ Switch between Events/Venues/Bands tabs
- ✅ Notice the active tab highlighted in orange

### Touch Targets
- ✅ Tap "Create Event" button - should be easy (48px height)
- ✅ Try Edit/Delete buttons - should be comfortable
- ✅ Form inputs should NOT zoom on focus (iOS)

### Overall Mobile UX
- ✅ No horizontal scrolling
- ✅ Buttons feel properly sized
- ✅ Navigation is thumb-friendly

## 🔧 If You Need Backend API

The signup flow works! But if you need to test with actual data:

1. Stop dev server (Ctrl+C)
2. Build frontend: `cd frontend && npm run build`
3. Start Wrangler: `npx wrangler pages dev dist`
4. Access at: http://localhost:8788

---

**Current Dev Server:** http://localhost:5173  
**Network URL:** http://192.168.1.94:5173  
**Signup:** http://192.168.1.94:5173/admin/signup  

Happy testing! 🎸

