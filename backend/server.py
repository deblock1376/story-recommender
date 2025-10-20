#!/usr/bin/env python3
"""
Backend server for Story Recommender extension
Fetches stories from Mirror Indy RSS feed and provides recommendations
"""

from flask import Flask, request, jsonify
from flask_cors import CORS
import feedparser
import requests
from datetime import datetime, timedelta
import re
from collections import Counter
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
import numpy as np
from bs4 import BeautifulSoup

app = Flask(__name__)
CORS(app)  # Enable CORS for Chrome extension

# Configuration
RSS_FEED_URL = "https://www.mirrorindy.org/feed"
CACHE_DURATION = timedelta(minutes=15)  # Refresh feed every 15 minutes

# Cache for stories
stories_cache = {
    "stories": [],
    "last_updated": None
}


def extract_keywords(text, num_keywords=10):
    """
    Extract important keywords from text
    Simple implementation - counts word frequency (excluding common words)
    """
    # Common stop words to exclude
    stop_words = {
        'the', 'a', 'an', 'and', 'or', 'but', 'in', 'on', 'at', 'to', 'for',
        'of', 'with', 'by', 'from', 'as', 'is', 'was', 'are', 'been', 'be',
        'have', 'has', 'had', 'do', 'does', 'did', 'will', 'would', 'could',
        'should', 'may', 'might', 'can', 'this', 'that', 'these', 'those',
        'i', 'you', 'he', 'she', 'it', 'we', 'they', 'what', 'which', 'who',
        'when', 'where', 'why', 'how', 'all', 'each', 'every', 'both', 'few',
        'more', 'most', 'other', 'some', 'such', 'than', 'too', 'very'
    }

    # Extract words (lowercase, alphanumeric only)
    words = re.findall(r'\b[a-z]+\b', text.lower())

    # Filter out stop words and short words
    filtered_words = [w for w in words if w not in stop_words and len(w) > 3]

    # Count frequency and return top keywords
    word_freq = Counter(filtered_words)
    return [word for word, count in word_freq.most_common(num_keywords)]


def fetch_rss_feed(feed_url=None):
    """
    Fetch and parse an RSS feed
    Returns list of stories with id, title, link, description, and keywords
    """
    if feed_url is None:
        feed_url = RSS_FEED_URL

    try:
        # Fetch the RSS feed
        feed = feedparser.parse(feed_url)

        if feed.bozo:
            print(f"Warning: Feed parsing had issues: {feed.bozo_exception}")

        stories = []
        for entry in feed.entries:
            # Extract story data
            story_id = entry.get('id', entry.get('link', ''))
            title = entry.get('title', 'Untitled')
            link = entry.get('link', '')
            description = entry.get('description', '') or entry.get('summary', '')

            # Clean HTML tags from description
            description_clean = re.sub('<[^<]+?>', '', description)

            # Extract keywords from title and description
            text_for_keywords = f"{title} {description_clean}"
            keywords = extract_keywords(text_for_keywords)

            stories.append({
                'id': story_id,
                'title': title,
                'link': link,
                'description': description_clean[:200],  # First 200 chars
                'keywords': keywords
            })

        print(f"Fetched {len(stories)} stories from RSS feed: {feed_url}")
        return stories

    except Exception as e:
        print(f"Error fetching RSS feed: {e}")
        return []


def get_stories(feed_urls=None):
    """
    Get stories from cache or fetch fresh if cache is expired
    Supports multiple feed URLs
    """
    global stories_cache

    # Use default feed if not specified
    if feed_urls is None:
        feed_urls = [RSS_FEED_URL]
    elif isinstance(feed_urls, str):
        feed_urls = [feed_urls]

    now = datetime.now()

    # Create cache key from feed URLs (sorted for consistency)
    cache_key = "|".join(sorted(feed_urls))
    cache_feed_key = stories_cache.get("feed_key", "")

    # Check if cache is valid and for the same feed URLs
    if (stories_cache["last_updated"] is None or
        now - stories_cache["last_updated"] > CACHE_DURATION or
        len(stories_cache["stories"]) == 0 or
        cache_feed_key != cache_key):

        # Fetch fresh stories from all feeds
        all_stories = []
        for feed_url in feed_urls:
            stories = fetch_rss_feed(feed_url)
            if stories:
                all_stories.extend(stories)

        if all_stories:
            stories_cache["stories"] = all_stories
            stories_cache["last_updated"] = now
            stories_cache["feed_key"] = cache_key
            print(f"Cache updated at {now} with {len(all_stories)} stories from {len(feed_urls)} feed(s)")
        else:
            print("Failed to fetch stories, using old cache if available")

    return stories_cache["stories"]


def calculate_similarity_tfidf(input_text, stories):
    """
    Calculate similarity between input text and stories using TF-IDF and cosine similarity
    Returns list of (similarity_score, story) tuples sorted by score
    """
    if not stories:
        return []

    # Prepare documents: input text + all story texts
    documents = [input_text]

    for story in stories:
        # Combine title (weighted higher by repeating) and description
        story_text = f"{story['title']} {story['title']} {story.get('description', '')}"
        documents.append(story_text)

    try:
        # Create TF-IDF vectorizer
        # - Remove common English stop words
        # - Consider 1-3 word phrases (n-grams)
        # - Ignore very rare and very common terms
        vectorizer = TfidfVectorizer(
            stop_words='english',
            ngram_range=(1, 2),  # Consider both single words and 2-word phrases
            max_df=0.8,          # Ignore terms that appear in >80% of docs
            min_df=1,            # Keep terms that appear in at least 1 doc
            lowercase=True
        )

        # Compute TF-IDF matrix
        tfidf_matrix = vectorizer.fit_transform(documents)

        # Calculate cosine similarity between input text (first doc) and all stories
        input_vector = tfidf_matrix[0:1]
        story_vectors = tfidf_matrix[1:]

        similarities = cosine_similarity(input_vector, story_vectors)[0]

        # Combine similarities with stories
        scored_stories = list(zip(similarities, stories))

        # Sort by similarity (highest first)
        scored_stories.sort(key=lambda x: x[0], reverse=True)

        return scored_stories

    except Exception as e:
        print(f"Error in TF-IDF calculation: {e}")
        # Fallback to simple keyword matching if TF-IDF fails
        return [(0, story) for story in stories]


@app.route('/recommend', methods=['POST'])
def recommend():
    """
    Endpoint to get story recommendations
    Expects JSON: {
        "text": "article text",
        "exclude_id": "optional_id_to_exclude",
        "feed_urls": ["url1", "url2"],
        "min_similarity": 0.01  # optional, default 0.01
    }
    Returns JSON: { "recommendations": [{ "title": "...", "link": "..." }] }
    """
    try:
        data = request.get_json()

        if not data or 'text' not in data:
            return jsonify({"error": "Missing 'text' field"}), 400

        text = data['text']
        exclude_id = data.get('exclude_id', '')
        feed_urls = data.get('feed_urls', None)
        min_similarity = data.get('min_similarity', 0.01)  # Default threshold

        # Also support old single feed_url parameter for backward compatibility
        if not feed_urls and 'feed_url' in data:
            feed_urls = [data['feed_url']]

        # Get current stories from specified feed(s)
        stories = get_stories(feed_urls)

        if not stories:
            return jsonify({"error": "No stories available"}), 503

        # Filter out excluded story
        filtered_stories = [s for s in stories if s['id'] != exclude_id]

        if not filtered_stories:
            return jsonify({"recommendations": []})

        # Use TF-IDF to calculate similarities
        scored_stories = calculate_similarity_tfidf(text, filtered_stories)

        # Get top recommendations (up to 5)
        # Filter out stories with similarity below threshold
        recommendations = [
            story for score, story in scored_stories[:10]
            if score >= min_similarity
        ][:5]

        # Log similarity scores for debugging
        if scored_stories:
            print(f"Top recommendation scores: {[round(score, 3) for score, _ in scored_stories[:5]]}")
            print(f"Threshold: {min_similarity}, Recommendations after filtering: {len(recommendations)}")

        # Format response (only include title and link)
        response = {
            "recommendations": [
                {"title": story["title"], "link": story["link"]}
                for story in recommendations
            ]
        }

        return jsonify(response)

    except Exception as e:
        print(f"Error in recommend endpoint: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/fetch-url', methods=['POST'])
def fetch_url():
    """
    Endpoint to fetch and extract text from a URL
    Expects JSON: { "url": "https://example.com/article" }
    Returns JSON: { "text": "extracted article text..." }
    """
    try:
        data = request.get_json()

        if not data or 'url' not in data:
            return jsonify({"error": "Missing 'url' field"}), 400

        url = data['url']

        # Fetch the URL
        headers = {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36'
        }

        response = requests.get(url, headers=headers, timeout=10)
        response.raise_for_status()

        # Parse HTML
        soup = BeautifulSoup(response.content, 'html.parser')

        # Remove unwanted elements
        for element in soup(['script', 'style', 'nav', 'header', 'footer', 'aside', 'iframe']):
            element.decompose()

        # Try to find article content
        text = ""

        # Strategy 1: Look for <article> tag
        article = soup.find('article')
        if article:
            text = article.get_text(separator=' ', strip=True)

        # Strategy 2: Look for main content area
        if not text or len(text) < 100:
            main = soup.find('main')
            if main:
                text = main.get_text(separator=' ', strip=True)

        # Strategy 3: Look for common content classes
        if not text or len(text) < 100:
            for selector in ['.article-content', '.post-content', '.entry-content', '.story-content', '.article-body']:
                content = soup.select_one(selector)
                if content:
                    text = content.get_text(separator=' ', strip=True)
                    if len(text) >= 100:
                        break

        # Strategy 4: Get headline + meta description as fallback
        if not text or len(text) < 100:
            headline = soup.find('h1')
            if headline:
                text = headline.get_text(strip=True) + ' '

            description = soup.find('meta', attrs={'name': 'description'})
            if description and description.get('content'):
                text += description.get('content')

            og_desc = soup.find('meta', attrs={'property': 'og:description'})
            if og_desc and og_desc.get('content'):
                text += ' ' + og_desc.get('content')

        # Clean up whitespace
        text = re.sub(r'\s+', ' ', text).strip()

        if not text or len(text) < 10:
            return jsonify({"error": "Could not extract text from URL"}), 400

        # Limit to reasonable length (first ~2000 chars)
        text = text[:2000]

        return jsonify({"text": text})

    except requests.RequestException as e:
        print(f"Error fetching URL: {e}")
        return jsonify({"error": f"Failed to fetch URL: {str(e)}"}), 400
    except Exception as e:
        print(f"Error in fetch-url endpoint: {e}")
        return jsonify({"error": str(e)}), 500


@app.route('/health', methods=['GET'])
def health():
    """Health check endpoint"""
    stories = get_stories()
    return jsonify({
        "status": "ok",
        "stories_count": len(stories),
        "last_updated": stories_cache["last_updated"].isoformat() if stories_cache["last_updated"] else None,
        "feed_url": RSS_FEED_URL
    })


@app.route('/refresh', methods=['POST'])
def refresh():
    """Force refresh the RSS feed cache"""
    global stories_cache
    stories_cache["last_updated"] = None  # Force refresh
    stories = get_stories()
    return jsonify({
        "status": "refreshed",
        "stories_count": len(stories)
    })


@app.route('/')
def index():
    """Serve the web app"""
    try:
        with open('../webapp/index.html', 'r') as f:
            return f.read()
    except FileNotFoundError:
        return """
        <h1>Story Recommender Backend</h1>
        <p>Backend server is running!</p>
        <p>To use the web app, open <code>webapp/index.html</code> in your browser.</p>
        <h2>API Endpoints:</h2>
        <ul>
            <li>POST /recommend - Get story recommendations</li>
            <li>POST /fetch-url - Fetch and extract text from URL</li>
            <li>GET /health - Health check</li>
            <li>POST /refresh - Force refresh RSS cache</li>
        </ul>
        """


if __name__ == '__main__':
    print("=" * 60)
    print("Story Recommender Backend Server")
    print("=" * 60)
    print("RSS Feed: https://www.mirrorindy.org/feed")
    print("Server running at: http://localhost:8000")
    print("\nEndpoints:")
    print("  POST /recommend  - Get story recommendations")
    print("  POST /fetch-url  - Fetch and extract text from URL")
    print("  GET  /health     - Health check")
    print("  POST /refresh    - Force refresh RSS cache")
    print("\nWeb App:")
    print("  Open webapp/index.html in your browser")
    print("  or visit http://localhost:8000")
    print("=" * 60)
    print("\nFetching initial stories from RSS feed...")

    # Fetch initial stories
    initial_stories = get_stories()
    print(f"Loaded {len(initial_stories)} stories")

    if initial_stories:
        print("\nSample stories:")
        for i, story in enumerate(initial_stories[:3], 1):
            print(f"  {i}. {story['title']}")

    print("\n" + "=" * 60)
    app.run(host='localhost', port=8000, debug=True)
