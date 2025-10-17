# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

Story Recommender is a Chrome browser extension (Manifest V3) that displays related story recommendations on web pages. It extracts content from the current page and queries a recommendation backend service to suggest relevant articles.

## Architecture

**Chrome Extension Structure:**
- `manifest.json` - Chrome extension manifest (V3) with content script permissions
- `content.js` - Content script injected into all pages that:
  1. Extracts story text from page (h1 headline + meta description)
  2. Sends text to recommendation backend at `http://localhost:8000/recommend`
  3. Injects a fixed-position recommendations widget into the page
- `popup.html` - Extension popup UI (currently empty)
- `style.css` - Extension styles (currently empty)

**Backend Dependency:**
The extension requires a recommendation service running at `http://localhost:8000/recommend` that:
- Accepts POST requests with JSON body: `{ "text": string, "exclude_id": string }`
- Returns JSON response: `{ "recommendations": [{ "title": string, "link": string }, ...] }`

## Development

**Loading the Extension:**
1. Open Chrome and navigate to `chrome://extensions/`
2. Enable "Developer mode" (top right toggle)
3. Click "Load unpacked" and select this directory
4. Extension will inject on all pages once the backend is running

**Testing:**
1. Start the recommendation backend service on port 8000
2. Navigate to any page with an `<h1>` tag or meta description
3. If text content > 10 characters, recommendations widget appears at top-right

**Debugging:**
- Use Chrome DevTools Console to see fetch errors or script issues
- Check Network tab for backend API calls to `/recommend`
- Extension only runs if backend responds successfully

## Key Implementation Details

**Content Extraction:**
- Primary source: First `<h1>` element's innerText
- Secondary source: `<meta name="description">` content attribute
- Minimum content length: 10 characters

**Recommendations Widget:**
- Positioned fixed at `top: 100px; right: 20px`
- Width: 300px
- Z-index: 9999 (overlays page content)
- Displays as unordered list with target="_blank" links

**Extension Permissions:**
- `scripting` and `activeTab` - Required for content script injection
- `host_permissions`: Currently restricted to `http://localhost:8000/`
- `matches`: `<all_urls>` - Content script runs on every page
