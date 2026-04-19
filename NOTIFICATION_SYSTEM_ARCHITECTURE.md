# 🔔 Notification System - Visual Architecture

## System Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                         NOTIFICATION SYSTEM                          │
└─────────────────────────────────────────────────────────────────────┘

                    USER INTERFACE LAYER
┌─────────────────────────────────────────────────────────────────────┐
│                                                                       │
│  Admin Dashboard                            Regular User Header       │
│  ┌─────────────────────────┐               ┌────────────────────┐   │
│  │ Quick Actions           │               │  🔔 Bell Icon     │   │
│  ├─────────────────────────┤               │  (Unread Badge)   │   │
│  │ ✓ Approve Mentors       │               └────────────────────┘   │
│  │ ✓ Manage Ratings        │                       │                │
│  │ ✓ Manage Withdrawals    │                       ↓                │
│  │ ► SEND ANNOUNCEMENT ◄─┐ │               ┌─ Dropdown Menu────┐   │
│  └─────────────────────────┘ │              │                   │   │
│           │                  │              │ • New Booking     │   │
│           ↓                  │              │ • Payment Done    │   │
│  ┌─────────────────────────┐ │              │ 📢 Announcement  │   │
│  │ Send Announcement Modal │ │              │ • New Message     │   │
│  ├─────────────────────────┤ │              │ • New Rating      │   │
│  │ Subject: [________]     │ │              │                   │   │
│  │                         │ │              │ ⋮ Actions:        │   │
│  │ Message:                │ │              │ View | Delete     │   │
│  │ [_______________]       │ │              └───────────────────┘   │
│  │                         │ │                                       │
│  │ [Send]  [Cancel]        │ │                                       │
│  └─────────────────────────┘ │                                       │
│           │                  │                                       │
│           └──────────────────┘                                       │
│                  │                                                   │
└──────────────────────────────────────────────────────────────────────┘
                   │
                   │ HTTP POST /api/admin/announce
                   │ { subject, message }
                   ↓
                   
                  API LAYER
┌─────────────────────────────────────────────────────────────────────┐
│                       Express.js Backend                             │
│                                                                      │
│  POST /api/admin/announce (adminAuth middleware)                   │
│  ├─ Validate subject & message                                     │
│  ├─ Fetch all users from DB                                        │
│  ├─ For each user:                                                 │
│  │  ├─ Call notifyUser(userId, {                                   │
│  │  │    type: 'system',                                           │
│  │  │    title: subject,                                           │
│  │  │    message: message,                                         │
│  │  │    icon: '📢',                                               │
│  │  │    actionUrl: '/app/dashboard'                               │
│  │  │  })                                                          │
│  │  │                                                              │
│  │  └─ notifyUser():                                               │
│  │      ├─ Create Notification in MongoDB                          │
│  │      ├─ Emit 'notification' socket event (if online)            │
│  │      └─ Return notification object                              │
│  │                                                                 │
│  └─ Return { success, recipients, errors }                        │
│                                                                    │
└────────────────────┬─────────────────────────────────────────────┘
                     │
        ┌────────────┴────────────┬────────────┐
        │                         │            │
        │ Create Notification     │ Socket     │ HTTP Response
        │ (MongoDB)               │ Emit       │ (JSON)
        ↓                         ↓            ↓
        
                  PERSISTENCE LAYER
┌─────────────────────────────────────────────────────────────────────┐
│                        MongoDB Database                             │
│                                                                    │
│  Collections:                                                      │
│  ├── Notifications                                                 │
│  │   ├── _id: ObjectId                                             │
│  │   ├── user: ObjectId (ref: User)                                │
│  │   ├── type: 'system'                                            │
│  │   ├── title: "Platform Update"                                  │
│  │   ├── message: "New features available"                         │
│  │   ├── icon: '📢'                                                │
│  │   ├── actionUrl: '/app/dashboard'                               │
│  │   ├── isRead: false                                             │
│  │   ├── readAt: null                                              │
│  │   ├── createdAt: 2026-04-19T02:45:00Z                          │
│  │   ├── expiresAt: 2026-05-19T02:45:00Z (TTL: 30 days)           │
│  │   └── metadata: { announcedBy: admin_id }                       │
│  │                                                                  │
│  └── Indexes:                                                      │
│      ├── { user: 1, isRead: 1, createdAt: -1 }                    │
│      └── { expiresAt: 1 } with TTL (auto-delete)                  │
│                                                                    │
└─────────────────────────────────────────────────────────────────────┘
                     │
        ┌────────────┴────────────┬────────────┐
        │                         │            │
        │                         │            │
        ↓                         ↓            ↓

    REAL-TIME LAYER          HTTP LAYER      CLIENT SOCKET
┌──────────────────────┐ ┌──────────────┐ ┌─────────────────┐
│ Socket.io Server     │ │ API Routes   │ │ React Frontend  │
├──────────────────────┤ ├──────────────┤ ├─────────────────┤
│                      │ │              │ │                 │
│ emit('notification') │ │ GET /api/    │ │ Socket.io       │
│ ↓                    │ │ notific...   │ │ Listener:       │
│ (to each user)       │ │              │ │                 │
│                      │ │ PATCH /api/  │ │ socket.on(      │
│ Broadcasts to:       │ │ notific.../  │ │  'notification' │
│ • Online users       │ │ read         │ │ )               │
│ • Connected sockets  │ │              │ │                 │
│                      │ │ DELETE /api/ │ │ Updates:        │
│                      │ │ notific...   │ │ • Notification  │
│                      │ │              │ │   list state    │
│                      │ │              │ │ • Unread count  │
│                      │ │              │ │ • Badge number  │
│                      │ │              │ │ • UI refresh    │
└──────────────────────┘ └──────────────┘ └─────────────────┘
        │
        │ 'notification' event
        │ {
        │   _id: "...",
        │   type: 'system',
        │   title: "...",
        │   message: "...",
        │   icon: '📢',
        │   createdAt: "..."
        │ }
        │
        ↓

    NOTIFICATION RECEIVED (React useNotifications Hook)
┌─────────────────────────────────────────────────────────┐
│                                                         │
│  useNotifications Hook                                  │
│  ├─ setNotifications([newNotif, ...existing])          │
│  ├─ setUnreadCount(prev + 1)                           │
│  ├─ toast.show(notification.title, 'info')            │
│  └─ playNotificationSound()                            │
│                                                         │
│  ↓                                                      │
│                                                         │
│  NotificationBell Component Rerenders                  │
│  ├─ Show red badge (unreadCount)                      │
│  ├─ Add to dropdown list                              │
│  ├─ Color coded: Red for 'system' type               │
│  └─ User can now:                                     │
│      • Click "View" → navigate + mark read            │
│      • Click "X" → delete notification                │
│      • Click "Mark all read" → clear badge           │
│                                                         │
└─────────────────────────────────────────────────────────┘

```

## User Journey

### Online User Path
```
Admin sends Announcement
         ↓
Server creates notification in DB
         ↓
Server emits socket event
         ↓
User receives 'notification' event in browser
         ↓
useNotifications hook updates state
         ↓
React re-renders NotificationBell
         ↓
✅ Notification visible immediately (<1 second)
```

### Offline User Path
```
Admin sends Announcement
         ↓
Server creates notification in DB
         ↓
Server tries to emit socket (fails, user offline)
         ↓
Notification stays in MongoDB
         ↓
User logs in later
         ↓
fetchUnread() called (API call)
         ↓
API retrieves unread notifications from DB
         ↓
✅ Notification appears in bell
```

## Notification Type Flow

```
Type Mapping:
┌──────────────┬─────────────┬───────────┬──────────┐
│ Type         │ Background  │ Icon Color│ Use Case │
├──────────────┼─────────────┼───────────┼──────────┤
│ booking      │ Blue        │ Blue      │ Session  │
│ payment      │ Green       │ Green     │ Payment  │
│ message      │ Purple      │ Purple    │ Chat     │
│ withdrawal   │ Amber       │ Amber     │ Withdraw │
│ rating       │ Yellow      │ Yellow    │ Review   │
│ system       │ 🔴 Red      │ 🔴 Red    │ Admin    │
│ announcement │ 🔴 Red      │ 🔴 Red    │ Admin    │
└──────────────┴─────────────┴───────────┴──────────┘
```

## Data Flow Sequence

```
TIME    COMPONENT               ACTION
────────────────────────────────────────────────────────
T0      Admin                   Clicks "Send Announcement"
        ↓
T1      Modal                   Opens (subject + message)
        ↓
T2      Admin                   Fills form and submits
        ↓
T3      Frontend API            POST /api/admin/announce
        ↓
T4      Backend Route           Receives request
        ↓
T5      Database               SELECT * FROM users
        ↓
T6      Backend Loop            For each user:
        │                         call notifyUser()
        │                           ├─ Create Notification
        │                           └─ Emit socket event
        ↓
T7      Database               INSERT Notification (×N users)
        ↓
T8      Socket.io              BROADCAST 'notification' event
        ↓
T9      Frontend Listeners     Receive 'notification'
        │                       Update state
        │                       Re-render UI
        ↓
T10     User UI                See red badge + notification
```

## Error Handling Flow

```
Notification Creation Attempt
         ↓
    Success? ─Yes→ Count++, Continue
         │
        No (DB error, socket error, etc.)
         ↓
    Count errors++, Log error, Continue with next user
         ↓
Return Response:
{
  success: true,
  recipients: 47,        ← Successfully created
  errors: 2,             ← Failed to create
  message: "Announcement sent to 47 users (2 errors)"
}
```

## Performance Metrics

```
Operation               Duration    Notes
─────────────────────────────────────────────────
POST /announce          ~1-5s       Depends on user count
  ├─ User fetch         ~50-100ms
  ├─ For each user:
  │  ├─ notifyUser()    ~20-50ms    (DB write + socket)
  │  └─ Loop N times    ~(20×N)ms   (parallel possible)
  └─ Response           ~100-200ms
  
Real-time delivery      <1000ms     Socket.io
DB query (get notif.)   ~50-100ms   With index
UI render               ~16-33ms    React, 60fps
Total user experience   <2000ms     Worst case
```

---

**Legend**:
- 📢 = Announcement icon
- 🔴 = Red color (system/announcement type)
- ✅ = Success/Complete
- ↓ = Flow direction
- ├─ = Sub-component
- └─ = Last sub-component

