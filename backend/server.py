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


if __name__ == '__main__':
    print("=" * 60)
    print("Story Recommender Backend Server - Mirror Indy Edition")
    print("=" * 60)
    print("RSS Feed: https://www.mirrorindy.org/feed")
    print("Server running at: http://localhost:8000")
    print("Endpoints:")
    print("  POST /recommend - Get story recommendations")
    print("  GET  /health    - Health check")
    print("  POST /refresh   - Force refresh RSS cache")
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
