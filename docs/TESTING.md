# SetTimes Testing Plan - Sprint 3.1

**Date**: November 19, 2025
**Goal**: Production-ready system with 80%+ critical path coverage
**Timeline**: 2 days

---

## 🎯 Testing Objectives

1. **Security**: No vulnerabilities (SQL injection, XSS, auth bypass)
2. **Functionality**: All critical workflows work end-to-end
3. **Performance**: All pages load in <2 seconds
4. **Accessibility**: WCAG 2.1 AA compliance
5. **Bug Fixes**: No P0/P1 bugs remaining

---

## 🔐 Security Audit Checklist

### Authentication & Authorization
- [ ] Login requires valid credentials
- [ ] Session tokens expire correctly
- [ ] RBAC enforces admin/editor/viewer permissions
- [ ] Password reset tokens are secure
- [ ] No auth bypass via direct URL access
- [ ] CSRF protection on all forms
- [ ] Secure cookie flags (httpOnly, secure, sameSite)

### SQL Injection Prevention
- [ ] All queries use parameterized statements
- [ ] No string concatenation in SQL
- [ ] User input properly sanitized
- [ ] Review all D1 database queries in `/functions/api/`

### XSS Prevention
- [ ] All user input escaped in HTML output
- [ ] React auto-escaping working correctly
- [ ] No `dangerouslySetInnerHTML` without sanitization
- [ ] Markdown editor sanitizes output
- [ ] URL parameters validated and escaped

### Data Validation
- [ ] Server-side validation on all endpoints
- [ ] Client-side validation provides UX
- [ ] File uploads restricted (type, size)
- [ ] Photo URLs validated before storage
- [ ] Date inputs validated (no past dates for events)

---

## ✅ Critical Workflow Tests (E2E)

### Workflow 1: Admin Login & Event Creation
**Steps**:
1. Navigate to `/admin/login`
2. Login with valid credentials
3. Click "Create Event" button
4. Fill in event details (name, date, venues)
5. Save event
6. Verify event appears in list

**Expected Result**: Event created successfully, appears in admin panel

**Test Data**:
- Event Name: "Test Band Crawl 2025"
- Date: 2025-12-15
- Status: Draft

---

### Workflow 2: Band Profile Creation & Assignment
**Steps**:
1. Login as admin
2. Navigate to Bands tab
3. Click "Add Band"
4. Fill in band details (name, genre, origin, bio)
5. Upload photo (or use URL)
6. Add social links
7. Save band
8. Assign band to event with venue and time
9. Verify band appears in event lineup

**Expected Result**: Band profile created, assigned to event, visible in public timeline

**Test Data**:
- Band Name: "The Testers"
- Genre: "Test Rock"
- Origin: "QA City, ON"

---

### Workflow 3: Public Event Timeline View
**Steps**:
1. Navigate to public homepage `/`
2. Verify event timeline loads
3. Click on event to expand
4. Verify venues and bands display
5. Click on band profile link
6. Verify band profile page loads with all data
7. Test "Now Playing" badge logic
8. Test filtering by venue
9. Test filtering by month

**Expected Result**: All public pages load, data displays correctly, filters work

---

### Workflow 4: Event Publishing Workflow
**Steps**:
1. Login as admin
2. Select draft event
3. Add 3+ venues
4. Add 5+ bands with schedules
5. Preview event timeline
6. Publish event
7. Verify event visible on public homepage
8. Verify embed code works
9. Test unpublish functionality

**Expected Result**: Published events visible publicly, drafts hidden

---

### Workflow 5: RBAC Permission Testing
**Steps**:
1. Create viewer account
2. Login as viewer
3. Attempt to create event (should fail)
4. Attempt to edit event (should fail)
5. Verify read-only access works
6. Login as editor
7. Verify can edit but not delete
8. Login as admin
9. Verify full access

**Expected Result**: Permission boundaries enforced correctly

---

## ♿ Accessibility Audit (WCAG 2.1 AA)

### Keyboard Navigation
- [ ] All interactive elements keyboard accessible
- [ ] Tab order is logical and intuitive
- [ ] Focus indicators visible on all elements
- [ ] No keyboard traps
- [ ] Skip to main content link present
- [ ] Modal dialogs trap focus correctly

### Screen Reader Support
- [ ] All images have alt text
- [ ] Form inputs have associated labels
- [ ] ARIA labels on icon buttons
- [ ] Headings hierarchical (h1 → h2 → h3)
- [ ] Landmark regions defined (nav, main, footer)
- [ ] Status messages announced

### Color & Contrast
- [ ] Text contrast ratio ≥ 4.5:1 (normal text)
- [ ] Text contrast ratio ≥ 3:1 (large text)
- [ ] UI components contrast ratio ≥ 3:1
- [ ] Color not sole indicator of state
- [ ] Focus indicators have 3:1 contrast

### Touch Targets
- [ ] All buttons min 44x44px touch target
- [ ] Adequate spacing between interactive elements
- [ ] Mobile-friendly tap targets

### Motion & Animation
- [ ] Respects `prefers-reduced-motion`
- [ ] No auto-playing animations >5 seconds
- [ ] Parallax effects disable-able

---

## ⚡ Performance Testing

### Page Load Times (Target: <2 seconds)
- [ ] Homepage (public timeline): _____ ms
- [ ] Admin panel dashboard: _____ ms
- [ ] Band profile page: _____ ms
- [ ] Event detail page: _____ ms
- [ ] Admin login page: _____ ms

### Bundle Size Analysis
- [ ] Main JS bundle size: _____ KB
- [ ] CSS bundle size: _____ KB
- [ ] Total page weight: _____ KB
- [ ] Images optimized (WebP, lazy loading)

### Database Query Optimization
- [ ] N+1 query problems identified and fixed
- [ ] Indexes on foreign keys
- [ ] Queries use LIMIT appropriately
- [ ] No full table scans on large tables

### Caching Strategy
- [ ] Static assets have cache headers
- [ ] API responses cached appropriately
- [ ] Cloudflare CDN configured
- [ ] Service worker for offline support (optional)

---

## 🐛 Bug Tracking

### P0 Bugs (Showstoppers)
*Track critical bugs that prevent core functionality*

| ID | Description | Status | Fix Commit |
|----|-------------|--------|------------|
| - | - | - | - |

### P1 Bugs (High Priority)
*Track bugs that significantly impact UX but don't break core features*

| ID | Description | Status | Fix Commit |
|----|-------------|--------|------------|
| - | - | - | - |

### P2 Bugs (Medium Priority)
*Track bugs that should be fixed but aren't critical*

| ID | Description | Status | Fix Commit |
|----|-------------|--------|------------|
| - | - | - | - |

---

## 📱 Mobile Device Testing

### iOS Safari
- [ ] iPhone SE (small screen)
- [ ] iPhone 14 Pro (standard)
- [ ] iPad (tablet)

### Android Chrome
- [ ] Small phone (360px width)
- [ ] Standard phone (414px width)
- [ ] Tablet (768px width)

### Test Scenarios
- [ ] Touch interactions work correctly
- [ ] No horizontal scrolling
- [ ] Bottom navigation accessible
- [ ] Forms usable on small screens
- [ ] Images scale correctly
- [ ] Modals display properly

---

## 🔍 Code Quality Checks

### Linting & Formatting
- [ ] ESLint passes with no errors
- [ ] Prettier formatting applied
- [ ] No console.log statements in production
- [ ] PropTypes defined for all components

### Security Dependencies
- [ ] `npm audit` shows 0 high/critical vulnerabilities
- [ ] All dependencies up to date
- [ ] No unused dependencies

### Code Review Checklist
- [ ] No hardcoded credentials
- [ ] Environment variables used correctly
- [ ] Error handling comprehensive
- [ ] Loading states on all async operations
- [ ] No TODO comments for critical features

---

## ✅ Test Coverage Goals

### Critical Paths (Must Test)
- [x] Sprint 2.0: Design system components render
- [x] Sprint 2.1: Event timeline displays and filters
- [x] Sprint 2.2: Band profiles load with all data
- [x] Sprint 2.3: Admin interface navigation and actions
- [ ] Admin login/logout flow
- [ ] Event creation and publishing
- [ ] Band profile CRUD operations
- [ ] RBAC permission enforcement
- [ ] Public timeline filtering

### Nice to Have (Time Permitting)
- [ ] User management interface
- [ ] Bulk operations
- [ ] Export functionality
- [ ] Advanced filtering
- [ ] Search functionality

---

## 📊 Testing Tools

### Automated Testing
- **Frontend**: Vitest (if configured)
- **E2E**: Manual testing (Playwright/Cypress if time permits)
- **Accessibility**: axe DevTools, Lighthouse
- **Performance**: Lighthouse, WebPageTest

### Manual Testing
- **Browser DevTools**: Network tab, Console, Lighthouse
- **Screen Readers**: NVDA (Windows), VoiceOver (Mac)
- **Mobile Testing**: Chrome DevTools device emulation

---

## 📝 Test Results Summary

**Date Tested**: _____________
**Tested By**: Claude (AI Assistant)
**Environment**: Development

### Overall Results
- **Security**: ☐ Pass ☐ Fail - Issues: _____
- **Functionality**: ☐ Pass ☐ Fail - Issues: _____
- **Performance**: ☐ Pass ☐ Fail - Issues: _____
- **Accessibility**: ☐ Pass ☐ Fail - Issues: _____
- **Mobile**: ☐ Pass ☐ Fail - Issues: _____

### P0/P1 Bugs Remaining: _____

### Recommended Actions Before Demo
1. _________________________________
2. _________________________________
3. _________________________________

---

## 🚀 Production Readiness Checklist

- [ ] All P0 bugs fixed
- [ ] Security audit passed
- [ ] Performance targets met (<2s load times)
- [ ] Accessibility compliance verified (WCAG 2.1 AA)
- [ ] Mobile testing complete
- [ ] Error handling graceful
- [ ] Loading states present
- [ ] No console errors in production
- [ ] Environment variables configured
- [ ] Database migrations tested
- [ ] Backup strategy in place
- [ ] Monitoring/logging configured

**Status**: ☐ READY FOR DEMO ☐ NEEDS WORK

---

**Next Steps**: Document findings, fix critical bugs, proceed to Sprint 3.2 (Documentation)
