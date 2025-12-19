#!/bin/bash

echo ""
echo "=========================================="
echo "  PolicyPal - Simple Backend Starter"
echo "=========================================="
echo ""

# Check if node is installed
if ! command -v node &> /dev/null; then
    echo "❌ Node.js is not installed"
    echo "   Please install Node.js 18+ from https://nodejs.org"
    exit 1
fi

echo "✓ Node.js $(node -v) found"

# Check for dependencies
if [ ! -d "node_modules" ]; then
    echo ""
    echo "Installing dependencies..."
    npm install
fi

# Check for API key
if [ -z "$ANTHROPIC_API_KEY" ]; then
    echo ""
    echo "⚠ ANTHROPIC_API_KEY not set"
    echo "  The server will use mock data for extraction."
    echo "  To use Claude API, run:"
    echo "  export ANTHROPIC_API_KEY=your-key-here"
    echo ""
fi

# Start server
echo ""
echo "Starting server..."
echo ""
node server.js
