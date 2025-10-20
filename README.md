# Story Recommender

A recommendation system that finds related articles using advanced TF-IDF similarity matching. Available as both a Chrome extension and standalone web app. Perfect for news websites, blogs, and content platforms to keep readers engaged with relevant content.

## Features

- **Smart Content Analysis**: Uses TF-IDF (Term Frequency-Inverse Document Frequency) with cosine similarity to find genuinely related articles
- **Two Interfaces**: Use as a Chrome extension or standalone web app
- **URL or Text Input**: Paste article URLs or raw text to find recommendations
- **Feed Groups**: Organize multiple RSS feeds into named groups (Chrome extension only)
- **Configurable Similarity Threshold**: Control recommendation quality
- **Multiple RSS Feeds**: Support for multiple RSS feed sources simultaneously
- **Badge Notifications**: Shows recommendation count on extension icon (Chrome extension only)
- **Keyboard Shortcut**: Quick toggle with `Ctrl+Shift+R` (Windows/Linux) or `Cmd+Shift+R` (Mac) (Chrome extension only)
- **Cross-Site Recommendations**: Extract content from any article and get recommendations from your configured feeds
- **Smart Text Extraction**: Multi-strategy approach using semantic HTML, metadata, and common selectors

## Demo

The extension automatically extracts article content from the current page and displays related stories in a customizable widget:

### How It Works

1. Visit any article or blog post
2. Extension extracts the main content
3. Sends text to local backend server
4. Backend uses TF-IDF algorithm to find similar stories from your RSS feeds
5. Widget displays top 5 most relevant recommendations
6. Badge on extension icon shows total count

### Widget Features

- **Dismissible**: Click the × button to close
- **Reopenable**: Click extension icon or use keyboard shortcut
- **Configurable**: Access settings by clicking the extension icon's popup

## Quick Start

### Web App (Easiest)

1. **Start the backend server**:
   ```bash
   cd backend
   pip3 install -r requirements.txt
   python3 server.py
   ```

2. **Open the web app**:
   - Open `webapp/index.html` in your browser, or
   - Visit `http://localhost:8000`

3. **Find recommendations**:
   - Paste an article URL or text
   - Add RSS feed URLs (one per line)
   - Adjust similarity threshold
   - Click "Find Related Articles"

### Chrome Extension

For automatic recommendations while browsing, install the Chrome extension:

## Installation

### Prerequisites

- Chrome browser (or Chromium-based browser) - for extension only
- Python 3.9+ (for backend server)
- `pip` package manager

### Backend Setup

1. **Navigate to the backend directory**:
   ```bash
   cd backend
   ```

2. **Install Python dependencies**:
   ```bash
   pip3 install -r requirements.txt
   ```

3. **Start the backend server**:
   ```bash
   python3 server.py
   ```

   The server will start on `http://localhost:8000` and fetch initial stories from the configured RSS feed.

### Chrome Extension Setup

1. **Open Chrome Extensions page**:
   - Navigate to `chrome://extensions/`
   - Enable "Developer mode" (toggle in top right)

2. **Load the extension**:
   - Click "Load unpacked"
   - Select the root directory of this project (containing `manifest.json`)

3. **Configure settings** (optional):
   - Click the extension icon in your toolbar
   - Adjust widget position, size, theme
   - Add/modify RSS feed URLs (one per line)

## Configuration

### Extension Settings

Access settings by clicking the extension icon:

- **Enable/Disable**: Toggle the extension on/off
- **Widget Position**: `top-right`, `top-left`, `bottom-right`, `bottom-left`
- **Widget Size**: `small` (250px), `medium` (320px), `large` (400px)
- **Theme**: `light` or `dark`
- **RSS Feeds**: Add multiple feed URLs (one per line)

### Backend Configuration

Edit `backend/server.py` to customize:

- **RSS_FEED_URL**: Default RSS feed (line 22)
- **CACHE_DURATION**: How long to cache stories (line 23, default 15 minutes)
- **TF-IDF Parameters**: Adjust similarity matching (lines 169-175)

## Architecture

### Chrome Extension (Manifest V3)

- **manifest.json**: Extension configuration and permissions
- **content.js**: Injected into all pages, extracts content and displays widget
- **background.js**: Service worker for keyboard shortcuts and badge updates
- **popup.html/js**: Settings interface
- **style.css**: Popup styling

### Backend Server (Flask)

- **server.py**: Flask REST API with three endpoints:
  - `POST /recommend`: Get story recommendations
  - `GET /health`: Health check and cache status
  - `POST /refresh`: Force refresh RSS cache

### How TF-IDF Works

1. **Tokenization**: Break text into words and 2-word phrases (n-grams)
2. **Stop Word Removal**: Filter out common English words
3. **TF-IDF Vectorization**: Calculate term importance across documents
4. **Cosine Similarity**: Measure angle between text vectors (0 = different, 1 = identical)
5. **Ranking**: Sort stories by similarity score, filter out scores < 0.01

## API Usage

### Request Recommendations

```bash
curl -X POST http://localhost:8000/recommend \
  -H "Content-Type: application/json" \
  -d '{
    "text": "Article text here...",
    "exclude_id": "optional_article_id_to_exclude",
    "feed_urls": ["https://example.com/feed"]
  }'
```

### Response

```json
{
  "recommendations": [
    {
      "title": "Related Article Title",
      "link": "https://example.com/article"
    }
  ]
}
```

## Development

### Project Structure

```
story-recommender/
├── manifest.json          # Extension manifest
├── content.js             # Content script
├── background.js          # Service worker
├── popup.html/js          # Settings UI
├── style.css              # Popup styles
├── webapp/                # Standalone web app
│   ├── index.html         # Web app interface
│   ├── style.css          # Web app styles
│   └── app.js             # Web app logic
├── backend/
│   ├── server.py          # Flask API server
│   ├── requirements.txt   # Python dependencies
│   └── README.md          # Backend docs
├── CLAUDE.md              # Development documentation
└── README.md              # This file
```

### Making Changes

1. **Modify web app**: Refresh browser to see changes
2. **Modify extension files**: After changes, reload extension at `chrome://extensions/`
3. **Modify backend**: Flask runs in debug mode and auto-reloads on file changes
4. **Test**: Visit any article page (extension) or use web app

### Git Workflow

```bash
# Make changes
git add .
git commit -m "Description of changes"
git push
```

## Use Cases

### Web App
- **Content Curation**: Journalists can find related stories from multiple sources
- **Story Research**: Quickly discover related coverage of a topic
- **Collaboration**: Share interesting connections between stories with colleagues
- **Demo/Testing**: Show the recommendation system to stakeholders

### Chrome Extension
- **News Websites**: Keep readers engaged with related articles
- **Blogs**: Suggest similar blog posts
- **Research**: Find related academic papers or articles
- **Documentation Sites**: Link to related documentation pages
- **Content Discovery**: Help users explore your content catalog

## Limitations

- Requires local backend server (not a hosted solution)
- RSS feeds must be accessible and properly formatted
- Extension only runs on pages with extractable content (articles, blog posts)
- Backend uses simple caching (not suitable for high-traffic production use)

## Future Enhancements

Potential improvements:
- Deploy backend to cloud (Heroku, AWS Lambda, etc.)
- Add support for more content sources beyond RSS
- Implement user feedback loop to improve recommendations
- Add analytics to track which recommendations users click
- Support for more languages (currently optimized for English)

## Troubleshooting

### Extension not showing recommendations

1. Check that backend server is running: `curl http://localhost:8000/health`
2. Open browser console (F12) and look for errors
3. Verify RSS feeds are accessible
4. Make sure page has extractable content (h1, article tags, etc.)

### Backend errors

1. Check Python version: `python3 --version` (need 3.9+)
2. Reinstall dependencies: `pip3 install -r backend/requirements.txt`
3. Check server logs for specific errors
4. Verify RSS feed URLs are valid

### Badge not updating

1. Reload the extension at `chrome://extensions/`
2. Check that content script and background script are both loaded
3. Look for console errors in extension service worker

## Credits

Built with:
- [Flask](https://flask.palletsprojects.com/) - Backend web framework
- [feedparser](https://feedparser.readthedocs.io/) - RSS feed parsing
- [scikit-learn](https://scikit-learn.org/) - TF-IDF and machine learning
- Chrome Extensions Manifest V3

## License

MIT License - Feel free to use, modify, and distribute.

---

**Note**: This extension requires a local backend server and is designed for development/demonstration purposes. For production use, consider deploying the backend to a hosted environment.
