#!/bin/bash

# ARETE - Start Script
# Starts backend, LiveKit agent, and frontend servers

echo "🚀 Starting ARETE..."
echo ""

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Get the directory where the script is located
SCRIPT_DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"

# Function to cleanup on exit
cleanup() {
    echo ""
    echo -e "${YELLOW}Shutting down servers...${NC}"
    kill $BACKEND_PID 2>/dev/null
    kill $AGENT_PID 2>/dev/null
    kill $FRONTEND_PID 2>/dev/null
    exit 0
}

trap cleanup SIGINT SIGTERM

# Load environment variables
if [ -f "$SCRIPT_DIR/.env" ]; then
    echo -e "${BLUE}Loading environment variables from .env...${NC}"
    export $(cat "$SCRIPT_DIR/.env" | grep -v '^#' | xargs)
fi

# Start Backend API
echo -e "${GREEN}Starting Backend API (FastAPI)...${NC}"
cd "$SCRIPT_DIR"
python3 -m uvicorn agent.main:app --host 0.0.0.0 --port 8000 &
BACKEND_PID=$!
sleep 2

# Check if backend started
if curl -s http://localhost:8000/health > /dev/null 2>&1; then
    echo -e "${GREEN}✓ Backend API running at http://localhost:8000${NC}"
else
    echo -e "${YELLOW}⚠ Backend API may still be starting...${NC}"
fi

# Start LiveKit Agent (AI Voice Interviewer)
echo ""
echo -e "${GREEN}Starting LiveKit Agent (AI Interviewer with STT/TTS)...${NC}"
cd "$SCRIPT_DIR"
python3 -m agent.livekit_agent dev &
AGENT_PID=$!
sleep 3

echo -e "${GREEN}✓ LiveKit Agent started (listens for voice, responds with AI)${NC}"

# Start Frontend on port 3001
echo ""
echo -e "${GREEN}Starting Frontend (Next.js) on port 3001...${NC}"
cd "$SCRIPT_DIR/frontend"
npm run dev -- -p 3001 &
FRONTEND_PID=$!
sleep 3

echo ""
echo -e "${GREEN}========================================${NC}"
echo -e "${GREEN}  ARETE is running!${NC}"
echo -e "${GREEN}========================================${NC}"
echo ""
echo -e "  Frontend:      ${YELLOW}http://localhost:3001${NC}"
echo -e "  Backend API:   ${YELLOW}http://localhost:8000${NC}"
echo -e "  API Docs:      ${YELLOW}http://localhost:8000/docs${NC}"
echo ""
echo -e "  ${BLUE}LiveKit Agent:${NC} Listening for voice input"
echo -e "    - STT: Deepgram (speech-to-text)"
echo -e "    - LLM: OpenRouter (AI responses)"
echo -e "    - TTS: ElevenLabs (text-to-speech)"
echo ""
echo -e "  Press ${RED}Ctrl+C${NC} to stop all servers"
echo ""

# Wait for all processes
wait
