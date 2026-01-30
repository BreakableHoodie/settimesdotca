# Component Usage Guide

**Design System Version:** 1.0.0
**Last Updated:** November 18, 2025

## Overview

This guide provides practical examples for using the SetTimes Design System components. All components are accessible, responsive, and follow WCAG 2.1 AA guidelines.

## Import Components

```jsx
import { Button, Input, Card, Badge, Alert, Modal, Loading } from '@/components/ui'
```

---

## Button

### Primary Actions

```jsx
<Button variant="primary" onClick={createEvent}>
  Create Event
</Button>
```

### Secondary Actions

```jsx
<Button variant="secondary" onClick={cancel}>
  Cancel
</Button>
```

### Destructive Actions

```jsx
<Button variant="danger" onClick={deleteEvent}>
  Delete Event
</Button>
```

### With Loading State

```jsx
<Button
  variant="primary"
  loading={isSubmitting}
  onClick={handleSubmit}
>
  {isSubmitting ? 'Saving...' : 'Save Event'}
</Button>
```

### Sizes

```jsx
<Button size="sm">Small</Button>
<Button size="md">Medium</Button>
<Button size="lg">Large</Button>
```

---

## Input

### Basic Text Input

```jsx
<Input
  label="Event Name"
  type="text"
  value={eventName}
  onChange={(e) => setEventName(e.target.value)}
  placeholder="Long Weekend Band Crawl Vol. 6"
  required
/>
```

### With Error State

```jsx
<Input
  label="Email"
  type="email"
  value={email}
  onChange={(e) => setEmail(e.target.value)}
  error={errors.email}
  helperText="We'll never share your email"
/>
```

### With Icon

```jsx
import { faSearch } from '@fortawesome/free-solid-svg-icons'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'

<Input
  placeholder="Search events..."
  value={search}
  onChange={(e) => setSearch(e.target.value)}
  icon={<FontAwesomeIcon icon={faSearch} />}
  iconPosition="left"
/>
```

---

## Card

### Basic Card

```jsx
<Card>
  <h3 className="text-xl font-bold mb-2">Event Title</h3>
  <p className="text-text-secondary">Event description...</p>
</Card>
```

### Hoverable Card (Interactive)

```jsx
<Card hoverable onClick={() => navigate(`/events/${event.id}`)}>
  <h3 className="text-xl font-bold">{event.name}</h3>
  <p className="text-text-tertiary">{event.date}</p>
</Card>
```

### Custom Padding

```jsx
<Card padding="lg">
  <h2 className="text-2xl font-bold">Large Padding</h2>
</Card>

<Card padding="none">
  <img src={banner} alt="Event banner" className="w-full rounded-t-xl" />
  <div className="p-6">
    <h3>Custom Content</h3>
  </div>
</Card>
```

---

## Badge

### Status Indicators

```jsx
<Badge variant="success">Published</Badge>
<Badge variant="warning">Draft</Badge>
<Badge variant="error">Archived</Badge>
<Badge variant="info">Scheduled</Badge>
```

### Sizes

```jsx
<Badge size="sm" variant="success">Small</Badge>
<Badge size="md" variant="success">Medium</Badge>
<Badge size="lg" variant="success">Large</Badge>
```

---

## Alert

### Success Notification

```jsx
<Alert variant="success" dismissible onClose={() => setShowAlert(false)}>
  Event published successfully!
</Alert>
```

### Error Notification

```jsx
<Alert variant="error">
  Failed to save event. Please try again.
</Alert>
```

### Warning with Custom Content

```jsx
<Alert variant="warning" dismissible onClose={handleDismiss}>
  <h4 className="font-bold mb-1">Unsaved Changes</h4>
  <p>You have unsaved changes. Are you sure you want to leave?</p>
</Alert>
```

---

## Modal

### Basic Modal

```jsx
const [isOpen, setIsOpen] = useState(false)

<Modal
  isOpen={isOpen}
  onClose={() => setIsOpen(false)}
  title="Create Event"
>
  <p>Modal content goes here...</p>
</Modal>
```

### Modal with Footer Actions

```jsx
<Modal
  isOpen={isOpen}
  onClose={() => setIsOpen(false)}
  title="Delete Event"
  size="sm"
  footer={
    <>
      <Button variant="secondary" onClick={() => setIsOpen(false)}>
        Cancel
      </Button>
      <Button variant="danger" onClick={handleDelete}>
        Delete
      </Button>
    </>
  }
>
  <p>Are you sure you want to delete this event? This action cannot be undone.</p>
</Modal>
```

### Large Modal with Form

```jsx
<Modal
  isOpen={isOpen}
  onClose={() => setIsOpen(false)}
  title="Edit Event"
  size="lg"
>
  <form onSubmit={handleSubmit} className="space-y-6">
    <Input
      label="Event Name"
      value={eventName}
      onChange={(e) => setEventName(e.target.value)}
      required
    />
    <Input
      label="Event Date"
      type="date"
      value={eventDate}
      onChange={(e) => setEventDate(e.target.value)}
      required
    />
    <div className="flex justify-end gap-3">
      <Button variant="secondary" onClick={() => setIsOpen(false)}>
        Cancel
      </Button>
      <Button variant="primary" type="submit">
        Save Changes
      </Button>
    </div>
  </form>
</Modal>
```

---

## Loading

### Inline Loading

```jsx
<Loading size="md" text="Loading events..." />
```

### Full Screen Loading

```jsx
{isLoading && (
  <Loading
    size="lg"
    text="Please wait..."
    fullScreen
  />
)}
```

### Inside Cards

```jsx
<Card>
  {isLoading ? (
    <Loading size="md" />
  ) : (
    <EventList events={events} />
  )}
</Card>
```

---

## Common Patterns

### Form with Validation

```jsx
function EventForm() {
  const [formData, setFormData] = useState({ name: '', date: '' })
  const [errors, setErrors] = useState({})
  const [isSubmitting, setIsSubmitting] = useState(false)

  const handleSubmit = async (e) => {
    e.preventDefault()
    setIsSubmitting(true)

    try {
      await saveEvent(formData)
      // Success
    } catch (error) {
      setErrors({ general: error.message })
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {errors.general && (
        <Alert variant="error">{errors.general}</Alert>
      )}

      <Input
        label="Event Name"
        value={formData.name}
        onChange={(e) => setFormData({ ...formData, name: e.target.value })}
        error={errors.name}
        required
      />

      <Input
        label="Event Date"
        type="date"
        value={formData.date}
        onChange={(e) => setFormData({ ...formData, date: e.target.value })}
        error={errors.date}
        required
      />

      <div className="flex justify-end gap-3">
        <Button variant="secondary" type="button" onClick={cancel}>
          Cancel
        </Button>
        <Button variant="primary" type="submit" loading={isSubmitting}>
          Create Event
        </Button>
      </div>
    </form>
  )
}
```

### List with Status

```jsx
function EventList({ events }) {
  return (
    <div className="space-y-4">
      {events.map((event) => (
        <Card key={event.id} hoverable onClick={() => viewEvent(event.id)}>
          <div className="flex items-start justify-between">
            <div>
              <h3 className="text-lg font-bold">{event.name}</h3>
              <p className="text-text-tertiary text-sm">{event.date}</p>
            </div>
            <Badge variant={event.isPublished ? 'success' : 'warning'}>
              {event.isPublished ? 'Published' : 'Draft'}
            </Badge>
          </div>
        </Card>
      ))}
    </div>
  )
}
```

### Confirmation Dialog

```jsx
function DeleteConfirmation({ event, onConfirm, onCancel }) {
  const [isOpen, setIsOpen] = useState(true)
  const [isDeleting, setIsDeleting] = useState(false)

  const handleConfirm = async () => {
    setIsDeleting(true)
    await onConfirm()
    setIsOpen(false)
  }

  return (
    <Modal
      isOpen={isOpen}
      onClose={onCancel}
      title="Confirm Deletion"
      size="sm"
      footer={
        <>
          <Button variant="secondary" onClick={onCancel} disabled={isDeleting}>
            Cancel
          </Button>
          <Button variant="danger" onClick={handleConfirm} loading={isDeleting}>
            Delete
          </Button>
        </>
      }
    >
      <Alert variant="warning">
        <p className="font-medium mb-2">This action cannot be undone</p>
        <p className="text-sm">
          Are you sure you want to delete "{event.name}"?
        </p>
      </Alert>
    </Modal>
  )
}
```

---

## Accessibility Checklist

When using components, ensure:

- [ ] All forms have labels
- [ ] Required fields are marked with `required` prop
- [ ] Error messages are descriptive
- [ ] Keyboard navigation works (Tab, Enter, Escape)
- [ ] Focus states are visible
- [ ] Loading states have appropriate aria-labels
- [ ] Modals trap focus and close on Escape
- [ ] Color isn't the only indicator of state

---

## Performance Tips

1. **Lazy Load Modals**: Only render modals when needed
2. **Debounce Inputs**: For search/filter inputs, debounce onChange handlers
3. **Virtualize Long Lists**: Use virtualization for lists with 100+ items
4. **Optimize Images**: Use appropriate sizes and lazy loading
5. **Reduce Re-renders**: Memoize callbacks and components when appropriate

---

**Next:** See [DESIGN_SYSTEM.md](./DESIGN_SYSTEM.md) for complete design tokens and specifications.
