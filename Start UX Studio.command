#!/bin/bash
# Double-click this file on a Mac to start UX Studio.
cd "$(dirname "$0")"

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js isn't installed yet."
  echo "Get the LTS version from https://nodejs.org, install it, then double-click this file again."
  open "https://nodejs.org"
  read -n 1 -s -r -p "Press any key to close."
  exit 1
fi

if [ ! -f .env ]; then
  echo "First-time setup."
  echo "Paste your Anthropic API key (it starts with sk-ant-) and press Enter."
  echo "Or just press Enter to try UX Studio with the sample results only."
  read -r KEY
  if [ -n "$KEY" ]; then echo "ANTHROPIC_API_KEY=$KEY" > .env; else touch .env; fi
fi

if [ ! -d node_modules ]; then
  echo "Installing (only the first time, takes a few minutes)…"
  npm install || { read -n 1 -s -r -p "Installing failed. Press any key to close."; exit 1; }
fi

if [ ! -d .next ] || [ -n "$(find app components lib agents -newer .next/BUILD_ID -print -quit 2>/dev/null)" ]; then
  echo "Preparing the app…"
  npm run build || { read -n 1 -s -r -p "Preparing failed. Press any key to close."; exit 1; }
fi

echo ""
echo "UX Studio is running at http://localhost:4747"
echo "Keep this window open while you use it. Close it to stop UX Studio."
(sleep 3 && open "http://localhost:4747") &
npm start
