#!/bin/bash

# Test script for video analysis API
# Usage: ./test-video-api.sh [INSTAGRAM_URL] [TIKTOK_URL]

API_URL="${API_URL:-http://localhost:3000/api/analyze-video}"

echo "Testing Video Analysis API"
echo "=========================="
echo ""

# Test with Instagram Reel URL
if [ -n "$1" ]; then
  INSTAGRAM_URL="$1"
else
  INSTAGRAM_URL="https://www.instagram.com/reel/EXAMPLE/"
fi

echo "Test 1: Analyzing Instagram Reel"
echo "URL: $INSTAGRAM_URL"
echo ""
curl -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -d "{
    \"videoUrl\": \"$INSTAGRAM_URL\",
    \"platform\": \"instagram\"
  }" | jq '.'
echo ""
echo ""

# Test with TikTok URL
if [ -n "$2" ]; then
  TIKTOK_URL="$2"
else
  TIKTOK_URL="https://www.tiktok.com/@example/video/1234567890"
fi

echo "Test 2: Analyzing TikTok Video"
echo "URL: $TIKTOK_URL"
echo ""
curl -X POST "$API_URL" \
  -H "Content-Type: application/json" \
  -d "{
    \"videoUrl\": \"$TIKTOK_URL\",
    \"platform\": \"tiktok\"
  }" | jq '.'

echo ""
echo "Tests complete!"
