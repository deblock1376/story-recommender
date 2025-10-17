async function getRecommendation(text, storyId = "", rssFeeds = null, minSimilarity = 0.01) {
  try {
    const requestBody = { text, exclude_id: storyId };
    if (rssFeeds) {
      requestBody.feed_urls = rssFeeds;
    }
    if (minSimilarity !== undefined && minSimilarity !== null) {
      requestBody.min_similarity = minSimilarity;
    }

    const response = await fetch("http://localhost:8000/recommend", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify(requestBody)
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`HTTP ${response.status}: ${errorText || response.statusText}`);
    }

    let data;
    try {
      data = await response.json();
    } catch (jsonError) {
      throw new Error(`Invalid JSON response: ${jsonError.message}`);
    }

    // Validate response structure
    if (!data || !Array.isArray(data.recommendations)) {
      throw new Error('Invalid response format: missing recommendations array');
    }

    // Update badge with recommendation count
    chrome.runtime.sendMessage({
      type: 'UPDATE_BADGE',
      count: data.recommendations.length
    }).catch(() => {
      // Ignore errors if background script isn't ready
    });

    return { success: true, recommendations: data.recommendations };
  } catch (error) {
    console.error("Story Recommender: Failed to fetch recommendations", error);
    // Clear badge on error
    chrome.runtime.sendMessage({
      type: 'UPDATE_BADGE',
      count: 0
    }).catch(() => {});
    return { success: false, error: error.message };
  }
}

function extractStoryText() {
  // Strategy 1: Try to find article content using semantic HTML
  let content = extractFromSemanticHTML();

  // Strategy 2: Fallback to metadata + headline
  if (!content || content.length < 50) {
    content = extractFromMetadata();
  }

  // Strategy 3: Try common article selectors
  if (!content || content.length < 50) {
    content = extractFromCommonSelectors();
  }

  // Limit to reasonable length for API (first ~1000 chars)
  return content.substring(0, 1000).trim();
}

function extractFromSemanticHTML() {
  // Try <article> tag first (best practice for article content)
  const article = document.querySelector("article");
  if (article) {
    return cleanText(article);
  }

  // Try <main> tag
  const main = document.querySelector("main");
  if (main) {
    return cleanText(main);
  }

  // Try role="main" or role="article"
  const roleMain = document.querySelector('[role="main"], [role="article"]');
  if (roleMain) {
    return cleanText(roleMain);
  }

  return "";
}

function extractFromMetadata() {
  const headline = document.querySelector("h1")?.innerText || "";
  const description = document.querySelector("meta[name='description']")?.content || "";
  const ogDescription = document.querySelector("meta[property='og:description']")?.content || "";

  // Use the longer description
  const summary = ogDescription.length > description.length ? ogDescription : description;

  return (headline + " " + summary).trim();
}

function extractFromCommonSelectors() {
  // Common class names used for article content
  const selectors = [
    ".article-content",
    ".post-content",
    ".entry-content",
    ".story-content",
    ".article-body",
    ".post-body",
    "#article-content",
    "#post-content",
    ".content"
  ];

  for (const selector of selectors) {
    const element = document.querySelector(selector);
    if (element && element.innerText.length > 100) {
      return cleanText(element);
    }
  }

  return "";
}

function cleanText(element) {
  // Clone the element to avoid modifying the page
  const clone = element.cloneNode(true);

  // Remove unwanted elements (ads, nav, scripts, etc.)
  const unwantedSelectors = [
    "script", "style", "nav", "header", "footer",
    ".advertisement", ".ad", ".ads", ".sidebar",
    ".social-share", ".related-posts", ".comments",
    "[role='navigation']", "[role='complementary']"
  ];

  unwantedSelectors.forEach(selector => {
    clone.querySelectorAll(selector).forEach(el => el.remove());
  });

  // Get text content and clean up whitespace
  let text = clone.innerText || clone.textContent || "";

  // Remove excessive whitespace and newlines
  text = text.replace(/\s+/g, " ").trim();

  return text;
}

function createCloseButton(container) {
  const button = document.createElement('button');
  button.id = 'close-widget';
  button.textContent = '×';
  button.style.background = 'none';
  button.style.border = 'none';
  button.style.fontSize = '20px';
  button.style.cursor = 'pointer';
  button.style.padding = '0';
  button.style.lineHeight = '1';
  button.addEventListener('click', () => {
    container.remove();
    widgetDismissed = true;
  });
  return button;
}

function showLoadingWidget(settings) {
  // Remove any existing widget
  const existing = document.getElementById('story-recommender-widget');
  if (existing) {
    existing.remove();
  }

  const container = document.createElement("div");
  container.id = 'story-recommender-widget';
  applyWidgetStyles(container, settings);

  // Create header
  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.justifyContent = 'space-between';
  header.style.alignItems = 'center';
  header.style.marginBottom = '8px';

  const title = document.createElement('h4');
  title.style.margin = '0';
  title.style.fontSize = '16px';
  title.textContent = 'Related Stories';

  header.appendChild(title);
  header.appendChild(createCloseButton(container));

  // Create loading message
  const loading = document.createElement('div');
  loading.style.padding = '10px';
  loading.style.textAlign = 'center';
  loading.style.opacity = '0.7';
  loading.textContent = 'Loading recommendations...';

  container.appendChild(header);
  container.appendChild(loading);
  document.body.appendChild(container);

  return container;
}

function showErrorWidget(errorMessage, settings) {
  const existing = document.getElementById('story-recommender-widget');
  if (existing) {
    existing.remove();
  }

  const container = document.createElement("div");
  container.id = 'story-recommender-widget';
  applyWidgetStyles(container, settings);

  // Create header
  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.justifyContent = 'space-between';
  header.style.alignItems = 'center';
  header.style.marginBottom = '8px';

  const title = document.createElement('h4');
  title.style.margin = '0';
  title.style.fontSize = '16px';
  title.textContent = 'Related Stories';

  header.appendChild(title);
  header.appendChild(createCloseButton(container));

  // Create error message
  const errorDiv = document.createElement('div');
  errorDiv.style.padding = '10px';
  errorDiv.style.color = '#d32f2f';

  const errorTitle = document.createElement('strong');
  errorTitle.textContent = 'Error: ';
  errorDiv.appendChild(errorTitle);
  errorDiv.appendChild(document.createTextNode('Unable to load recommendations.'));
  errorDiv.appendChild(document.createElement('br'));

  const errorDetail = document.createElement('small');
  errorDetail.textContent = errorMessage;
  errorDiv.appendChild(errorDetail);
  errorDiv.appendChild(document.createElement('br'));
  errorDiv.appendChild(document.createElement('br'));

  const helpText = document.createElement('small');
  helpText.textContent = 'Make sure the backend server is running at http://localhost:8000';
  errorDiv.appendChild(helpText);

  container.appendChild(header);
  container.appendChild(errorDiv);
  document.body.appendChild(container);
}

function insertRecommendations(recommendations, settings) {
  // Remove any existing widget
  const existing = document.getElementById('story-recommender-widget');
  if (existing) {
    existing.remove();
  }

  const container = document.createElement("div");
  container.id = 'story-recommender-widget';
  applyWidgetStyles(container, settings);

  // Create header
  const header = document.createElement('div');
  header.style.display = 'flex';
  header.style.justifyContent = 'space-between';
  header.style.alignItems = 'center';
  header.style.marginBottom = '8px';

  const title = document.createElement('h4');
  title.style.margin = '0';
  title.style.fontSize = '16px';
  title.textContent = 'Related Stories';

  header.appendChild(title);
  header.appendChild(createCloseButton(container));

  // Create list
  const list = document.createElement('ul');
  list.style.paddingLeft = '20px';
  list.style.margin = '0';
  list.style.listStyleType = 'disc';

  recommendations.forEach(rec => {
    const li = document.createElement('li');
    li.style.marginBottom = '8px';

    const link = document.createElement('a');
    link.href = rec.link;
    link.target = '_blank';
    link.style.color = 'inherit';
    link.style.textDecoration = 'underline';
    link.textContent = rec.title;

    li.appendChild(link);
    list.appendChild(li);
  });

  container.appendChild(header);
  container.appendChild(list);
  document.body.appendChild(container);
}

function applyWidgetStyles(container, settings) {
  // Base styles
  container.style.position = 'fixed';
  container.style.zIndex = '9999';
  container.style.padding = '12px';
  container.style.borderRadius = '8px';
  container.style.boxShadow = '0 2px 10px rgba(0,0,0,0.1)';
  container.style.fontFamily = '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif';

  // Position
  const positions = {
    'top-right': { top: '20px', right: '20px' },
    'top-left': { top: '20px', left: '20px' },
    'bottom-right': { bottom: '20px', right: '20px' },
    'bottom-left': { bottom: '20px', left: '20px' }
  };
  Object.assign(container.style, positions[settings.position] || positions['top-right']);

  // Size
  const sizes = {
    'small': { width: '250px', fontSize: '12px' },
    'medium': { width: '320px', fontSize: '14px' },
    'large': { width: '400px', fontSize: '16px' }
  };
  Object.assign(container.style, sizes[settings.size] || sizes['medium']);

  // Theme
  const themes = {
    'light': {
      background: 'white',
      color: '#333',
      border: '1px solid #ddd'
    },
    'dark': {
      background: '#2b2b2b',
      color: '#e0e0e0',
      border: '1px solid #444'
    }
  };
  Object.assign(container.style, themes[settings.theme] || themes['light']);
}

// Default settings
const DEFAULT_SETTINGS = {
  enabled: true,
  position: 'top-right',
  size: 'medium',
  theme: 'light',
  rssFeeds: ['https://www.mirrorindy.org/feed'],
  minSimilarity: 0.1  // Default threshold: 0.1 (10% similarity minimum)
};

// Track if widget has been dismissed on this page
let widgetDismissed = false;

// Listen for messages
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  if (message.type === 'SETTINGS_UPDATED') {
    // Reload with new settings if widget exists
    const existing = document.getElementById('story-recommender-widget');
    if (existing && message.settings.enabled) {
      // Handle backward compatibility
      if (!message.settings.rssFeeds && message.settings.rssFeedUrl) {
        message.settings.rssFeeds = [message.settings.rssFeedUrl];
      } else if (!message.settings.rssFeeds) {
        message.settings.rssFeeds = DEFAULT_SETTINGS.rssFeeds;
      }

      const text = extractStoryText();
      if (text.length > 10) {
        showLoadingWidget(message.settings);
        getRecommendation(text, '', message.settings.rssFeeds, message.settings.minSimilarity).then(result => {
          if (result.success) {
            if (result.recommendations.length > 0) {
              insertRecommendations(result.recommendations, message.settings);
            } else {
              // No recommendations, remove widget
              const existing = document.getElementById('story-recommender-widget');
              if (existing) {
                existing.remove();
              }
            }
          } else {
            showErrorWidget(result.error, message.settings);
          }
        });
      }
    } else if (existing && !message.settings.enabled) {
      existing.remove();
    }
  } else if (message.type === 'TOGGLE_WIDGET') {
    // Toggle widget visibility when extension icon is clicked
    const existing = document.getElementById('story-recommender-widget');
    if (existing) {
      // Widget exists, remove it
      existing.remove();
      widgetDismissed = true;
    } else {
      // Widget doesn't exist, show it
      widgetDismissed = false;
      chrome.storage.sync.get(DEFAULT_SETTINGS, (settings) => {
        if (settings.enabled) {
          // Handle backward compatibility
          if (!settings.rssFeeds && settings.rssFeedUrl) {
            settings.rssFeeds = [settings.rssFeedUrl];
          } else if (!settings.rssFeeds) {
            settings.rssFeeds = DEFAULT_SETTINGS.rssFeeds;
          }

          const text = extractStoryText();
          if (text.length > 10) {
            showLoadingWidget(settings);
            getRecommendation(text, '', settings.rssFeeds, settings.minSimilarity).then(result => {
              if (result.success) {
                if (result.recommendations.length > 0) {
                  insertRecommendations(result.recommendations, settings);
                } else {
                  // No recommendations, remove widget
                  const existing = document.getElementById('story-recommender-widget');
                  if (existing) {
                    existing.remove();
                  }
                }
              } else {
                showErrorWidget(result.error, settings);
              }
            });
          }
        }
      });
    }
  }
});

// Initialize and run
chrome.storage.sync.get(DEFAULT_SETTINGS, (settings) => {
  if (!settings.enabled) {
    console.log("Story Recommender: Extension is disabled in settings");
    return;
  }

  // Handle backward compatibility - migrate old rssFeedUrl to rssFeeds array
  if (!settings.rssFeeds && settings.rssFeedUrl) {
    settings.rssFeeds = [settings.rssFeedUrl];
  } else if (!settings.rssFeeds) {
    settings.rssFeeds = DEFAULT_SETTINGS.rssFeeds;
  }

  const text = extractStoryText();
  console.log("Story Recommender: Extracted text length:", text.length);

  if (text.length > 10) {
    showLoadingWidget(settings);
    getRecommendation(text, '', settings.rssFeeds, settings.minSimilarity).then(result => {
      if (result.success) {
        console.log("Story Recommender: Successfully loaded", result.recommendations.length, "recommendations");
        if (result.recommendations.length > 0) {
          insertRecommendations(result.recommendations, settings);
        } else {
          console.log("Story Recommender: No recommendations above similarity threshold");
          // No recommendations, remove widget
          const existing = document.getElementById('story-recommender-widget');
          if (existing) {
            existing.remove();
          }
        }
      } else {
        console.error("Story Recommender: Error loading recommendations:", result.error);
        showErrorWidget(result.error, settings);
      }
    });
  } else {
    console.log("Story Recommender: Not enough text content to generate recommendations");
  }
});
