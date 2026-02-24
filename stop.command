#!/bin/bash
# Job Material Tracker — Double-click to stop
echo "Stopping Job Material Tracker..."

# Kill any Flask process on port 5001
lsof -ti:5001 | xargs kill -9 2>/dev/null

echo "Server stopped."
sleep 1
