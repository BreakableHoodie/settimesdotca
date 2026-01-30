# SetTimes User Guide
**For Event Organizers**

This guide will help you manage your events, venues, and performers on the SetTimes platform. No technical expertise required!

---

## Table of Contents

1. [Getting Started](#getting-started)
2. [Creating Your First Event](#creating-your-first-event)
3. [Managing Venues](#managing-venues)
4. [Managing Performers](#managing-performers)
5. [Publishing Your Event](#publishing-your-event)
6. [Understanding the Interface](#understanding-the-interface)
7. [Band Profile Pages](#band-profile-pages)
8. [Public Event Timeline](#public-event-timeline)
9. [Tips for Success](#tips-for-success)
10. [Troubleshooting](#troubleshooting)

---

## Getting Started

### Logging In

1. Go to your admin panel at `settimes.ca/admin`
2. Enter your email and password
3. Click "Sign In"

**Tip:** Bookmark this page on your phone for quick access during event setup!

### Your Admin Dashboard

After logging in, you'll see three main tabs:

- **📅 Events** - Create and manage your events
- **📍 Venues** - Add and edit performance locations
- **🎸 Performers** - Schedule bands with times and venues

The interface is **mobile-optimized** with:
- Large touch targets (44px minimum)
- Bottom navigation on mobile
- Responsive design for all screen sizes
- Keyboard shortcuts on desktop

---

## Creating Your First Event

### Step 1: Open the Event Wizard

1. Click the "Create Event" button (orange button at the top)
2. The step-by-step event wizard will open

### Step 2: Enter Event Details

Fill in the required fields:

- **Event Name:** e.g., "Spring Music Festival 2025"
- **Event Date:** The date your event takes place
- **URL Slug:** Short name for the web address (e.g., "spring-2025" creates `/events/spring-2025`)
- **Description** (optional): Brief description shown on public pages

**Important:** The slug will be used in the public URL and band profile URLs. Keep it short, lowercase, and use hyphens.

### Step 3: Add Venues

For each performance location:

1. Enter venue name (e.g., "The Analog Cafe")
2. Add address (optional but recommended)
3. Add website and social media links (optional)
4. Click "Add Venue"
5. Repeat for all venues
6. Click "Next" when done

**Tip:** You can add more venues later if plans change!

### Step 4: Add Performances

For each band/performer:

1. Enter band name
2. Select venue from dropdown
3. Set start time (when they go on stage)
4. Set end time or duration in minutes
5. Add website URL (optional)
6. Add social media links (optional)
7. Click "Add"
8. Repeat for all performers

**Conflict Detection:** The system will highlight scheduling conflicts if two bands are booked at the same venue at overlapping times.

**Tip:** Add bands in chronological order to stay organized!

### Step 5: Review and Publish

1. Review all information in the summary
2. Click "Create Event" (saves as draft)
3. Review the draft in the Events tab
4. When ready, publish it (see [Publishing Your Event](#publishing-your-event))

**Note:** Events start as drafts. Only publish when all information is finalized!

---

## Managing Venues

### Adding a New Venue

1. Go to the **📍 Venues** tab
2. Click "Add Venue"
3. Fill in the form:
   - **Name** (required)
   - **Address** (recommended)
   - **Website** (optional)
   - **Instagram** (optional - enter username without @)
   - **Facebook** (optional - full URL or page name)
4. Click "Save Venue"

**Design System:** Venues use the SetTimes design system with accessible forms, clear labels, and helpful validation messages.

### Editing a Venue

1. Find the venue in the list
2. Click the "Edit" button (pencil icon)
3. Make your changes
4. Click "Update Venue"

### Viewing Venue History

1. Find the venue in the list
2. Click "History" or "View Details"
3. See all past performances at that venue
4. View statistics (total events, total performers)

**Note:** You cannot delete a venue that has active performances assigned to it.

### Deleting a Venue

1. Ensure no bands are currently assigned to the venue
2. Click the "Delete" button (trash icon)
3. Confirm deletion in the dialog

**Warning:** Deletions are permanent and cannot be undone!

---

## Managing Performers

### Adding a New Performer

1. Go to the **🎸 Performers** tab
2. Select your event from the context banner (optional)
3. Click "Add Performer"
4. Fill in the form:
   - **Band Name** (required)
   - **Event** (select from dropdown or leave blank)
   - **Venue** (select from dropdown or assign later)
   - **Start Time** (required if event/venue set)
   - **End Time** OR **Duration in minutes**
   - **Website** (optional)
   - **Instagram** (optional - username without @)
   - **Facebook** (optional)
   - **Description** (optional - shown on band profile page)
5. Click "Save Performer"

### Editing a Performance

1. Find the performance in the list
2. Click "Edit" button (pencil icon)
3. Make your changes
4. Click "Update Performer"

**Tooltips:** Hover over field labels to see helpful tips and requirements.

### Deleting a Performance

1. Find the performance in the list
2. Click "Delete" button (trash icon)
3. Confirm deletion in the confirmation dialog

**Confirm Dialog:** SetTimes uses a confirmation dialog to prevent accidental deletions of important data.

**Warning:** Deleting a performance cannot be undone!

### Mobile Swipe Gestures

On mobile devices:
- **Swipe left** on a band to reveal the delete button
- **Swipe right** to hide the delete button

---

## Publishing Your Event

### Making Your Event Public

1. Go to the **📅 Events** tab
2. Find your draft event (marked with a "Draft" badge)
3. Click "Edit"
4. Check the "Published" checkbox
5. Click "Save Changes"

**Important:** Only publish when ALL information is correct! Once published, attendees can see it on the public timeline.

### Event Status Badges

Events display color-coded status badges:
- **Draft** (gray) - Not visible to public
- **Published** (green) - Live and visible
- **Archived** (orange) - Past event, read-only

### Unpublishing

Need to make changes to a published event?

1. Go to the **📅 Events** tab
2. Find your event
3. Click "Edit"
4. Uncheck "Published"
5. Make your changes
6. Re-publish when ready

**Tip:** Unpublishing removes the event from the public timeline immediately.

---

## Understanding the Interface

### Context Banner

When you select an event, a **context banner** appears at the top showing:
- Event name and date
- Number of performers and venues
- Quick action buttons (View Event, Clear Selection)

**Benefit:** Helps you stay focused on one event at a time and avoid mistakes.

### Breadcrumbs

Navigation breadcrumbs show your current location:
```
All Events > Spring Festival 2025 > Performers
```

Click any breadcrumb to navigate back.

### Design System Components

SetTimes uses a consistent design system throughout:

**Buttons:**
- **Primary** (orange) - Main actions like "Save" or "Create"
- **Secondary** (outlined) - Less prominent actions like "Cancel"
- **Danger** (red) - Destructive actions like "Delete"
- **Ghost** (transparent) - Tertiary actions

**Alerts:**
- **Success** (green) - Operation completed
- **Error** (red) - Something went wrong
- **Warning** (yellow) - Important notice
- **Info** (blue) - Helpful information

**Loading States:**
- Animated spinners show when data is loading
- Prevents accidental double-clicks
- Provides visual feedback

**Tooltips:**
- Hover over labels with (?) icon to see helpful tips
- Works on both hover (desktop) and focus (keyboard)

### Accessibility Features

SetTimes is WCAG 2.1 AA compliant:
- **Keyboard Navigation** - Use Tab, Enter, Escape to navigate
- **Screen Reader Support** - All content properly labeled
- **Focus Indicators** - Clear outlines show where you are
- **Skip Navigation** - Press Tab on page load to skip to main content
- **Reduced Motion** - Respects user motion preferences

---

## Band Profile Pages

### What are Band Profiles?

Every band/performer automatically gets a public profile page at:
```
settimes.ca/bands/[event-slug]/[band-name]
```

**Example:** `settimes.ca/bands/spring-2025/the-sunset-trio`

### Profile Features

**Automatically Generated Content:**
- Band name and description
- Event association
- Venue and performance time
- Social media links (if provided)
- Performance history (if multiple events)
- SEO-optimized metadata

**SEO Optimization:**
- Open Graph tags for social sharing
- Twitter Cards for previews
- Proper page titles and descriptions
- Canonical URLs

**Sharing:**
- Share links automatically include rich previews
- Facebook, Twitter, LinkedIn show band info
- QR codes can be generated for posters

### Editing Band Profile Content

1. Go to **🎸 Performers** tab
2. Find the band and click "Edit"
3. Update the **Description** field (supports markdown)
4. Add or update social media links
5. Upload a photo (if photo support is enabled)
6. Click "Save"

**Tip:** Write compelling descriptions that fans will want to read and share!

---

## Public Event Timeline

### What is the Timeline?

The public-facing event schedule at `settimes.ca` shows:
- All published events
- Real-time performance schedules
- Venue locations
- Band profile links

### Timeline Features (Sprint 2.1)

**Filtering:**
- Filter by venue (click venue name)
- Filter by month (click month selector)
- Clear filters to see all events

**Real-Time Updates:**
- Changes appear within 1-2 minutes
- No need to refresh manually
- Cache automatically managed

**Mobile-Optimized:**
- Responsive cards for each performance
- Swipeable on mobile
- Bottom sheet navigation

**Accessibility:**
- Keyboard-navigable
- Screen reader friendly
- High contrast ratios

### Testing Your Event

Before announcing:

1. Publish the event
2. Open `settimes.ca` in a private/incognito window
3. Verify all bands appear
4. Check times and venues are correct
5. Test band profile links
6. Test on mobile device
7. Share with a friend for feedback

---

## Tips for Success

### Before the Event

- [ ] Create event at least 2 weeks in advance
- [ ] Add all venues first, then performers
- [ ] Add accurate times with 15-30 minute buffers between sets
- [ ] Review for scheduling conflicts (highlighted in red)
- [ ] Write compelling band descriptions
- [ ] Add all social media links
- [ ] Test the public timeline on multiple devices
- [ ] Publish event

### During Setup

- [ ] Keep venue names consistent (avoid "The Analog" and "Analog Cafe")
- [ ] Use clear, readable time formats
- [ ] Add realistic set lengths (account for setup/teardown)
- [ ] Double-check AM/PM times
- [ ] Get feedback from someone else before publishing
- [ ] Have a backup plan for last-minute changes

### Best Practices

**Save Often:**
- Don't rely on auto-save
- Click "Save" after every major change

**Double-Check Times:**
- Incorrect times cause attendee confusion
- Allow buffer time between bands

**Keep It Simple:**
- Use official band names (as they brand themselves)
- Don't overcomplicate venue names
- Write clear, concise descriptions

**Test Before Publishing:**
- Always preview the public schedule
- Check on both mobile and desktop
- Verify all links work

**Backup Important Info:**
- Screenshot your final schedule
- Export event data if available
- Keep venue contact info handy

---

## Troubleshooting

### "I can't add a performance - the venue dropdown is empty"

**Solution:** Add venues first! Go to the Venues tab and create your venues before adding performances.

---

### "I see a conflict warning but the times look right"

**Solution:** Check the full time range. A band ending at 9:00pm conflicts with another starting at 9:00pm at the same venue. Leave at least 15-30 minutes between acts for setup/teardown.

---

### "My changes aren't showing on the public timeline"

**Solution:**
1. Make sure the event is Published (not Draft)
2. Wait 1-2 minutes for the cache to update
3. Refresh the page (Ctrl+R or Cmd+R)
4. Try a private/incognito window
5. Check that the event date hasn't passed

---

### "I accidentally deleted a performance"

**Solution:** Unfortunately, deletions are permanent. You'll need to re-add the performance manually. Always confirm carefully in the deletion dialog!

**Prevention:** SetTimes shows a confirmation dialog to prevent accidents.

---

### "The admin panel isn't loading on my phone"

**Solution:**
1. Pull down to refresh the page
2. Check your internet connection
3. Try a different browser (Chrome, Safari, Firefox)
4. Clear your browser cache
5. Make sure you're at `settimes.ca/admin`
6. Contact support if the issue persists

---

### "I can't delete a venue"

**Solution:** You cannot delete a venue that has performances assigned to it. You need to:

1. Go to Performers tab
2. Find all performances at that venue
3. Either delete them or reassign them to a different venue
4. Then you can delete the venue

**Protection:** This prevents data integrity issues.

---

### "The event wizard won't let me continue"

**Solution:** Check for:
- Required fields marked with asterisks (*)
- Red error messages under fields
- Invalid date formats
- Duplicate event slugs

**Validation:** SetTimes validates all data before saving to prevent errors.

---

### "Band profile links return 404 errors"

**Solution:**
1. Ensure the event is published
2. Check the event slug is correct (no spaces or special characters)
3. Verify the band is assigned to that event
4. Wait 1-2 minutes for cache updates
5. Check the full URL format: `settimes.ca/bands/[event-slug]/[band-name-slug]`

---

### "I need to change the event slug after publishing"

**Solution:** Changing slugs breaks existing links. If you must:

1. Create a new event with the correct slug
2. Duplicate all venues and performers
3. Unpublish and archive the old event
4. Update any external links or social media posts

**Best Practice:** Choose slugs carefully before publishing!

---

## Mobile Optimization Tips

### Touch-Friendly Interface

All buttons and interactive elements are optimized for mobile:
- Minimum 44x44px touch targets (WCAG AAA)
- Large, easy-to-tap buttons
- Generous spacing between elements
- No tiny checkboxes or links

### Bottom Navigation (Mobile)

On mobile devices, use the bottom navigation bar:
- **📅 Events** - Manage events
- **📍 Venues** - Add/edit venues
- **🎸 Performers** - Schedule performances

### Form Tips

**Auto-Optimized Keyboards:**
- Email fields show email keyboard
- Number fields show number pad
- URL fields show URL keyboard (with .com shortcut)
- Time fields show time picker

**Auto-Complete:**
- Venue names auto-suggest from existing venues
- Band names auto-suggest if they've performed before

---

## Keyboard Shortcuts (Desktop)

**Global:**
- `Tab` - Navigate through form fields and buttons
- `Shift + Tab` - Navigate backwards
- `Enter` - Submit forms or activate buttons
- `Escape` - Close modal dialogs and dropdowns
- `Ctrl/Cmd + S` - Save current form (when available)

**Navigation:**
- `Alt + E` - Go to Events tab
- `Alt + V` - Go to Venues tab
- `Alt + P` - Go to Performers tab

**Accessibility:**
- `Tab` on page load - Reveals "Skip to main content" link
- Focus indicators always visible

---

## Getting Help

### In-App Help

- **Tooltips:** Hover over (?) icons for contextual help
- **Validation Messages:** Red error messages explain what's wrong
- **Empty States:** Helpful prompts when tabs are empty
- **Context Banner:** Shows current event context

### Documentation

- **User Guide** (this document) - Comprehensive how-to guide
- **Admin Handbook** - For system administrators
- **Quick Start Guide** - 10-minute setup tutorial
- **Troubleshooting Guide** - Common issues and solutions

### Contact Support

- **GitHub Issues:** [github.com/BreakableHoodie/settimesdotca/issues](https://github.com/BreakableHoodie/settimesdotca/issues)
- Include:
  - Your event name
  - What you're trying to do
  - Screenshots (help us help you faster!)
  - Browser and device info

### Quick Reference Card

**Login:** `settimes.ca/admin`

**Add Event:** Events tab → Create Event → Follow wizard

**Add Venue:** Venues tab → Add Venue → Fill form → Save

**Add Band:** Performers tab → Add Performer → Fill form → Save

**Publish:** Events tab → Edit event → Check "Published" → Save

**Emergency Stop:** Events tab → Edit event → Uncheck "Published" → Save

---

## Security & Privacy

### Your Data is Protected

SetTimes uses industry-standard security:
- **HTTPS/TLS encryption** for all data transmission
- **HTTPOnly cookies** prevent XSS attacks
- **CSRF protection** on all state-changing requests
- **Role-based access control** (only editors/admins can modify data)
- **Audit logging** tracks all important actions
- **Regular security audits** (latest: November 2025 - Rating A)

### Best Practices

**Passwords:**
- Use a strong, unique password (min. 8 characters)
- Include uppercase, lowercase, and numbers
- Never share your credentials
- Change passwords quarterly

**Account Security:**
- Log out when using shared devices
- Don't save passwords on public computers
- Enable 2FA if available
- Report suspicious activity immediately

---

## Frequently Asked Questions

**Q: Can multiple people edit the same event?**
A: Yes! Multiple editors can work simultaneously. However, the last save wins, so coordinate with your team to avoid conflicts.

**Q: Can I import data from a spreadsheet?**
A: Not currently, but this feature is planned. For now, use copy-paste to speed up data entry.

**Q: How many events/venues/bands can I create?**
A: No hard limits! The system is designed to scale. Performance is optimized for hundreds of events.

**Q: Can I customize the public timeline appearance?**
A: The timeline uses the SetTimes design system. Custom branding may be available for enterprise plans.

**Q: Can attendees buy tickets through SetTimes?**
A: Not currently. Add ticket links to event descriptions or band profiles.

**Q: Is there an API for integrations?**
A: Not yet, but an API is on the roadmap. See API_DOCUMENTATION.md for planned features.

**Q: Can I export my event data?**
A: Database export tools are available to administrators. Contact support for assistance.

---

**Questions?** Refer to the other guides:
- [Admin Handbook](./ADMIN_HANDBOOK.md) - For system administrators
- [Quick Start Guide](./QUICK_START.md) - 10-minute setup tutorial
- [API Documentation](./API_DOCUMENTATION.md) - For developers
- [Troubleshooting Guide](./TROUBLESHOOTING.md) - Common issues

---

**Version:** 2.0
**Last Updated:** November 2025
**For:** SetTimes Platform (settimes.ca)

---

**Need More Help?** We're here to make your event a success! Contact us anytime through GitHub issues or your administrator.
