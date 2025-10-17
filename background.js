// Background service worker for Story Recommender extension

// Listen for keyboard commands
chrome.commands.onCommand.addListener((command) => {
  if (command === 'toggle-widget') {
    // Get the active tab and send toggle message to content script
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      if (tabs[0]) {
        chrome.tabs.sendMessage(tabs[0].id, { type: 'TOGGLE_WIDGET' }).catch(() => {
          console.log('Content script not ready on this tab');
        });
      }
    });
  }
});

// Listen for messages from popup or content scripts
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handle badge updates from content script
  if (message.type === 'UPDATE_BADGE' && sender.tab) {
    const count = message.count || 0;

    if (count > 0) {
      // Set badge with count
      chrome.action.setBadgeText({
        text: count.toString(),
        tabId: sender.tab.id
      });

      // Set badge color (blue to match extension theme)
      chrome.action.setBadgeBackgroundColor({
        color: '#4a90e2',
        tabId: sender.tab.id
      });
    } else {
      // Clear badge if no recommendations
      chrome.action.setBadgeText({
        text: '',
        tabId: sender.tab.id
      });
    }
  }
});
