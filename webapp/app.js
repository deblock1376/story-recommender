// API Configuration
const API_BASE_URL = 'http://localhost:8000';

// DOM Elements
const tabs = document.querySelectorAll('.tab');
const tabContents = document.querySelectorAll('.tab-content');
const articleUrlInput = document.getElementById('article-url');
const articleTextInput = document.getElementById('article-text');
const feedUrlsInput = document.getElementById('feed-urls');
const minSimilarityInput = document.getElementById('min-similarity');
const similarityValueSpan = document.getElementById('similarity-value');
const findBtn = document.getElementById('find-btn');
const resultsSection = document.getElementById('results-section');
const loadingEl = document.getElementById('loading');
const errorEl = document.getElementById('error');
const errorMessageEl = document.getElementById('error-message');
const recommendationsEl = document.getElementById('recommendations');
const recommendationsListEl = document.getElementById('recommendations-list');
const noResultsEl = document.getElementById('no-results');

// Tab Switching
tabs.forEach(tab => {
  tab.addEventListener('click', () => {
    const targetTab = tab.dataset.tab;

    // Update tab buttons
    tabs.forEach(t => t.classList.remove('active'));
    tab.classList.add('active');

    // Update tab content
    tabContents.forEach(content => {
      if (content.id === `${targetTab}-tab`) {
        content.classList.add('active');
      } else {
        content.classList.remove('active');
      }
    });
  });
});

// Similarity Slider
minSimilarityInput.addEventListener('input', (e) => {
  similarityValueSpan.textContent = e.target.value + '%';
});

// Find Related Articles
findBtn.addEventListener('click', async () => {
  const activeTab = document.querySelector('.tab.active').dataset.tab;

  let text = '';
  let isUrl = false;

  if (activeTab === 'url') {
    const url = articleUrlInput.value.trim();
    if (!url) {
      showError('Please enter an article URL');
      return;
    }
    if (!isValidUrl(url)) {
      showError('Please enter a valid URL');
      return;
    }
    text = url;
    isUrl = true;
  } else {
    text = articleTextInput.value.trim();
    if (!text) {
      showError('Please paste some article text');
      return;
    }
    if (text.length < 50) {
      showError('Please provide more text (at least 50 characters)');
      return;
    }
  }

  // Get feed URLs
  const feedUrls = feedUrlsInput.value
    .split('\n')
    .map(url => url.trim())
    .filter(url => url.length > 0);

  if (feedUrls.length === 0) {
    showError('Please add at least one RSS feed URL');
    return;
  }

  // Get similarity threshold
  const minSimilarity = parseInt(minSimilarityInput.value) / 100;

  // Find recommendations
  await findRecommendations(text, isUrl, feedUrls, minSimilarity);
});

// Enter key to submit
articleUrlInput.addEventListener('keypress', (e) => {
  if (e.key === 'Enter') {
    findBtn.click();
  }
});

// Helper: Validate URL
function isValidUrl(string) {
  try {
    new URL(string);
    return true;
  } catch (_) {
    return false;
  }
}

// Show Loading State
function showLoading() {
  resultsSection.classList.add('show');
  loadingEl.classList.add('show');
  errorEl.classList.remove('show');
  recommendationsEl.classList.remove('show');
  noResultsEl.classList.remove('show');
  findBtn.disabled = true;
}

// Show Error
function showError(message) {
  resultsSection.classList.add('show');
  loadingEl.classList.remove('show');
  errorEl.classList.add('show');
  recommendationsEl.classList.remove('show');
  noResultsEl.classList.remove('show');
  errorMessageEl.textContent = message;
  findBtn.disabled = false;
}

// Show Recommendations
function showRecommendations(recommendations) {
  resultsSection.classList.add('show');
  loadingEl.classList.remove('show');
  errorEl.classList.remove('show');

  if (recommendations.length === 0) {
    recommendationsEl.classList.remove('show');
    noResultsEl.classList.add('show');
  } else {
    recommendationsEl.classList.add('show');
    noResultsEl.classList.remove('show');

    // Render recommendations
    recommendationsListEl.innerHTML = '';
    recommendations.forEach((rec, index) => {
      const card = createRecommendationCard(rec, index + 1);
      recommendationsListEl.appendChild(card);
    });
  }

  findBtn.disabled = false;
}

// Create Recommendation Card
function createRecommendationCard(recommendation, position) {
  const card = document.createElement('div');
  card.className = 'recommendation-card';

  const link = document.createElement('a');
  link.href = recommendation.link;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';

  const title = document.createElement('h3');
  title.textContent = recommendation.title;

  const meta = document.createElement('div');
  meta.className = 'meta';

  const positionSpan = document.createElement('span');
  positionSpan.textContent = `#${position}`;

  if (recommendation.score !== undefined) {
    const scoreSpan = document.createElement('span');
    scoreSpan.className = 'score';
    scoreSpan.textContent = `${Math.round(recommendation.score * 100)}% match`;
    meta.appendChild(scoreSpan);
  }

  meta.appendChild(positionSpan);

  link.appendChild(title);
  link.appendChild(meta);
  card.appendChild(link);

  return card;
}

// Find Recommendations
async function findRecommendations(text, isUrl, feedUrls, minSimilarity) {
  showLoading();

  try {
    let articleText = text;

    // If URL provided, fetch the content first
    if (isUrl) {
      try {
        const fetchResponse = await fetch(`${API_BASE_URL}/fetch-url`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json'
          },
          body: JSON.stringify({ url: text })
        });

        if (!fetchResponse.ok) {
          const errorData = await fetchResponse.json().catch(() => ({}));
          throw new Error(errorData.error || `Failed to fetch article (HTTP ${fetchResponse.status})`);
        }

        const fetchData = await fetchResponse.json();
        articleText = fetchData.text;

        if (!articleText || articleText.length < 10) {
          throw new Error('Could not extract enough text from the URL');
        }
      } catch (fetchError) {
        throw new Error(`Failed to fetch article: ${fetchError.message}`);
      }
    }

    // Get recommendations
    const response = await fetch(`${API_BASE_URL}/recommend`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        text: articleText,
        feed_urls: feedUrls,
        min_similarity: minSimilarity
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();

    if (!data || !Array.isArray(data.recommendations)) {
      throw new Error('Invalid response from server');
    }

    showRecommendations(data.recommendations);

  } catch (error) {
    console.error('Error finding recommendations:', error);
    showError(error.message || 'An unexpected error occurred. Make sure the backend server is running at http://localhost:8000');
  }
}

// Initialize
console.log('Story Recommender Web App initialized');
console.log('Backend API:', API_BASE_URL);
