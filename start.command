#!/bin/bash
# Job Material Tracker — Double-click to start
cd "$(dirname "$0")"

echo "=================================="
echo "  Job Material Tracker"
echo "=================================="
echo ""

# Install dependencies if needed
if ! python3 -c "import flask" 2>/dev/null; then
    echo "Installing dependencies..."
    pip3 install -r requirements.txt
    echo ""
fi

if ! python3 -c "import openpyxl" 2>/dev/null; then
    echo "Installing openpyxl..."
    pip3 install openpyxl
    echo ""
fi

# Get local IP for network access
LOCAL_IP=$(ipconfig getifaddr en0 2>/dev/null || echo "localhost")

echo "Starting server..."
echo ""
echo "  Local:   http://localhost:5001"
echo "  Network: http://$LOCAL_IP:5001"
echo ""
echo "Share the Network URL with coworkers on the same Wi-Fi."
echo "Close this window or double-click stop.command to stop."
echo ""

# Open browser after a short delay
(sleep 1.5 && open "http://localhost:5001") &

# Start the server
python3 app.py
