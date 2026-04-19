#!/bin/bash
# Test announcement endpoint
# Usage: bash test-announcement.sh "Subject here" "Message here" "admin_token_here"

SUBJECT="${1:-Test Announcement}"
MESSAGE="${2:-This is a test announcement from the system}"
ADMIN_TOKEN="${3:-your_admin_token_here}"

echo "🔔 Testing Announcement Endpoint..."
echo "Subject: $SUBJECT"
echo "Message: $MESSAGE"
echo ""

curl -X POST http://localhost:5000/api/admin/announce \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $ADMIN_TOKEN" \
  -d "{
    \"subject\": \"$SUBJECT\",
    \"message\": \"$MESSAGE\"
  }" \
  | jq .

echo ""
echo "✅ Announcement sent! Check the database for Notification records."
