# Announcement Notification System

## Overview
The admin can now send announcements through the Admin Dashboard, and these announcements will automatically appear in every user's notification bell as real-time notifications.

## What Was Implemented

### 1. Backend Updates (src/routes/admin.js)
- **Endpoint**: `POST /api/admin/announce`
- **Auth**: Admin token required
- **Functionality**:
  - Accepts `subject` and `message` from the frontend
  - Fetches all users from the database
  - For each user, calls `notifyUser()` which:
    - Creates a notification record in MongoDB
    - Emits a real-time socket event if the user is online
  - Returns success count and error count

### 2. Frontend Updates

#### useNotifications.ts Hook
- Added `'system'` and `'announcement'` to the Notification type
- Listens for 'notification' socket events
- Automatically updates the UI when announcements arrive

#### NotificationBell.tsx Component
- Added color styling for `'system'` and `'announcement'` types (red highlight)
- Displays announcements with a 📢 emoji icon
- Shows unread badge when announcements arrive
- User can:
  - Click "View" to navigate to dashboard
  - Click "X" to delete the announcement
  - Mark all as read

#### DashboardHome.tsx (Already Exists)
- Button: "Send Announcement" in the Quick Actions section
- Modal: "Send Announcement" with:
  - Subject input field
  - Message textarea
  - Send button that calls `adminApi.announce()`

### 3. Database Updates
- **Notification Model**: Already has `type: 'system'` enum value
- **TTL Index**: Auto-deletes notifications after 30 days
- **Quick Indexes**: User + isRead + createdAt for fast queries

## How It Works

### Flow Diagram
```
Admin Opens Dashboard
    ↓
Clicks "Send Announcement" button
    ↓
Fills subject & message
    ↓
Clicks "Send"
    ↓
POST /api/admin/announce
    ↓
Backend loops through all users:
  - Calls notifyUser(userId, notificationData)
  - notifyUser creates notification in DB + emits socket event
    ↓
For Online Users:
  - Socket event received immediately
  - useNotifications hook updates state
  - NotificationBell shows unread badge
  - Notification appears in dropdown

For Offline Users:
  - Notification saved in DB
  - When user logs in, fetchUnread() retrieves it
  - Notification appears in bell
```

## Testing Steps

### 1. Start the Servers
```bash
# Terminal 1: Backend
cd "c:\Users\Talha\Desktop\devlink by deep"
npm start

# Terminal 2: Frontend
cd "c:\Users\Talha\Desktop\devlink by deep\frontend"
npm run dev
```

### 2. Test as Admin
1. Open http://localhost:5173 (or your frontend port)
2. Login as admin
3. Go to Admin Dashboard (`/admin`)
4. Click "Send Announcement" button in Quick Actions
5. Enter:
   - Subject: "System Maintenance"
   - Message: "Platform will be under maintenance tonight"
6. Click "Send"
7. Check the response (should show "Announcement sent to X users")

### 3. Test in Separate Browser/Incognito
1. Open browser in incognito/private mode
2. Login as a different user (student or mentor)
3. Look at the bell icon in the top-right header
4. You should see:
   - Red notification badge with count
   - Red 📢 icon
   - Notification dropdown with announcement

### 4. Verify Real-Time
- Have 2+ browsers open with different users logged in
- Send announcement from admin
- All browsers should receive the notification in real-time
- Bell icons should update immediately

### 5. Test Offline Scenario
1. User 1: Open dashboard and logout
2. Admin: Send announcement
3. User 1: Login again
4. User 1 should see the announcement in the bell

## Notification Type Colors

| Type | Background | Icon Color | Use Case |
|------|-----------|-----------|----------|
| booking | Blue | Blue | New booking requests |
| payment | Green | Green | Payment confirmations |
| message | Purple | Purple | New messages |
| withdrawal | Amber | Amber | Withdrawal status |
| rating | Yellow | Yellow | New ratings/reviews |
| **system/announcement** | **Red** | **Red** | Admin announcements |

## Files Modified

1. **src/routes/admin.js** (Line 210-263)
   - Updated POST /api/admin/announce endpoint
   - Now creates notifications for all users using notifyUser()

2. **frontend/src/hooks/useNotifications.ts** (Line 8)
   - Added 'announcement' to Notification type union

3. **frontend/src/components/UX/NotificationBell.tsx** (Lines 27-47)
   - Added color styling for 'system' and 'announcement' types
   - Red highlight for announcements (📢 emoji icon)

## Already Implemented (Pre-existing)
- ✅ Notification Model (MongoDB)
- ✅ NotificationService (CRUD operations)
- ✅ Socket.io integration (notifyUser function)
- ✅ API routes (/api/notifications/*)
- ✅ Admin Dashboard UI (Send Announcement button)
- ✅ adminApi.announce() method
- ✅ Real-time socket listeners

## Troubleshooting

### Announcement not appearing in bell
1. Check browser console for errors
2. Verify admin token is valid
3. Check MongoDB - should have new Notification documents
4. Check socket connection (Network tab → WS)

### Error: "Cannot read properties of undefined (reading 'notifyUser')"
- Ensure src/socket/index.js exports notifyUser
- Verify require path is correct

### Some users don't receive announcement
- Check if user is in Database (Notification model requires user: ObjectId)
- For offline users, check if they fetch notifications on login

## API Response Example

```json
{
  "success": true,
  "message": "Announcement sent to 47 users",
  "recipients": 47,
  "errors": 0
}
```

## Future Enhancements
- [ ] Email notifications for announcements
- [ ] Announcement scheduling (send at specific time)
- [ ] Target specific user groups (mentors only, students only, etc.)
- [ ] Announcement history page
- [ ] Analytics (who read the announcement)
