// Default settings
const DEFAULT_SETTINGS = {
  enabled: true,
  position: 'top-right',
  size: 'medium',
  theme: 'light',
  rssFeeds: ['https://www.mirrorindy.org/feed'],
  minSimilarity: 0.1  // Default 10%
};

// Load saved settings when popup opens
document.addEventListener('DOMContentLoaded', async () => {
  const settings = await loadSettings();

  // Populate form with saved settings
  document.getElementById('enabled').checked = settings.enabled;
  document.getElementById('position').value = settings.position;
  document.getElementById('size').value = settings.size;
  document.getElementById('theme').value = settings.theme;

  // Handle both old (rssFeedUrl) and new (rssFeeds) format
  if (settings.rssFeeds && Array.isArray(settings.rssFeeds)) {
    document.getElementById('rssFeeds').value = settings.rssFeeds.join('\n');
  } else if (settings.rssFeedUrl) {
    // Migrate from old single URL format
    document.getElementById('rssFeeds').value = settings.rssFeedUrl;
  } else {
    document.getElementById('rssFeeds').value = DEFAULT_SETTINGS.rssFeeds.join('\n');
  }

  // Set similarity threshold (convert 0.0-1.0 to 0-100 percentage)
  const similarityPercent = Math.round((settings.minSimilarity || 0.1) * 100);
  document.getElementById('minSimilarity').value = similarityPercent;
  document.getElementById('similarityValue').textContent = similarityPercent + '%';

  // Update similarity value display when slider moves
  document.getElementById('minSimilarity').addEventListener('input', (e) => {
    document.getElementById('similarityValue').textContent = e.target.value + '%';
  });

  // Add save button listener
  document.getElementById('save').addEventListener('click', saveSettings);
});

// Load settings from Chrome storage
async function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULT_SETTINGS, (items) => {
      resolve(items);
    });
  });
}

// Save settings to Chrome storage
async function saveSettings() {
  const feedsText = document.getElementById('rssFeeds').value.trim();

  // Parse feeds - one per line, filter empty lines
  const rssFeeds = feedsText
    .split('\n')
    .map(url => url.trim())
    .filter(url => url.length > 0);

  // Get similarity threshold and convert from percentage (0-100) to decimal (0.0-1.0)
  const similarityPercent = parseInt(document.getElementById('minSimilarity').value);
  const minSimilarity = similarityPercent / 100;

  const settings = {
    enabled: document.getElementById('enabled').checked,
    position: document.getElementById('position').value,
    size: document.getElementById('size').value,
    theme: document.getElementById('theme').value,
    rssFeeds: rssFeeds.length > 0 ? rssFeeds : DEFAULT_SETTINGS.rssFeeds,
    minSimilarity: minSimilarity
  };

  chrome.storage.sync.set(settings, () => {
    // Show success message
    showStatus('Settings saved successfully!', 'success');

    // Notify content scripts to reload with new settings
    chrome.tabs.query({}, (tabs) => {
      tabs.forEach((tab) => {
        chrome.tabs.sendMessage(tab.id, { type: 'SETTINGS_UPDATED', settings }).catch(() => {
          // Ignore errors for tabs where content script isn't loaded
        });
      });
    });
  });
}

// Show status message
function showStatus(message, type) {
  const statusEl = document.getElementById('status');
  statusEl.textContent = message;
  statusEl.className = `status ${type}`;

  setTimeout(() => {
    statusEl.className = 'status hidden';
  }, 3000);
}
