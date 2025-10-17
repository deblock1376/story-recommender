# Story Recommender Backend

Simple Flask-based backend server for the Story Recommender Chrome extension.

## Setup

1. **Install Python dependencies:**
   ```bash
   pip install -r requirements.txt
   ```

   Or with Python 3:
   ```bash
   pip3 install -r requirements.txt
   ```

2. **Run the server:**
   ```bash
   python server.py
   ```

   Or with Python 3:
   ```bash
   python3 server.py
   ```

3. **Verify it's running:**
   - Open http://localhost:8000/health in your browser
   - You should see: `{"status": "ok", "stories_count": 10}`

## API Endpoints

### POST /recommend
Returns story recommendations based on text content.

**Request:**
```json
{
  "text": "article content here",
  "exclude_id": "optional_story_id_to_exclude"
}
```

**Response:**
```json
{
  "recommendations": [
    {
      "title": "Related Story Title",
      "link": "https://example.com/story"
    }
  ]
}
```

### GET /health
Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "stories_count": 10
}
```

## How It Works

The server uses a simple keyword-based matching algorithm:
1. Each story has associated keywords
2. When text is submitted, it calculates similarity by counting keyword matches
3. Returns top 5 most similar stories
4. If no matches, returns random stories

## Customization

Edit `server.py` to:
- Add more sample stories to `SAMPLE_STORIES`
- Improve the similarity algorithm
- Connect to a real database
- Add more sophisticated NLP (TF-IDF, embeddings, etc.)
