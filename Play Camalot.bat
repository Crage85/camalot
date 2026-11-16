@echo off
rem Double-click to play: starts Camalot and opens it in your browser.
rem Keep this black window open while playing. Close it to stop.
cd /d "%~dp0"
if not exist node_modules call npm install
npx vite --open
