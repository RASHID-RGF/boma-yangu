#!/bin/bash
export NEXT_PUBLIC_APP_URL="${NEXT_PUBLIC_APP_URL:-http://localhost:3001}"
exec npx next dev -p 3001
