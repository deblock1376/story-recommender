// Default settings with groups structure
const DEFAULT_SETTINGS = {
  enabled: true,
  position: 'top-right',
  size: 'medium',
  theme: 'light',
  minSimilarity: 0.1,
  activeGroup: 'default',
  groups: {
    'default': {
      name: 'Default',
      feeds: ['https://www.mirrorindy.org/feed'],
      minSimilarity: 0.1
    }
  }
};

let currentSettings = null;

// Load saved settings when popup opens
document.addEventListener('DOMContentLoaded', async () => {
  currentSettings = await loadSettings();

  // Populate general settings
  document.getElementById('enabled').checked = currentSettings.enabled;
  document.getElementById('position').value = currentSettings.position;
  document.getElementById('size').value = currentSettings.size;
  document.getElementById('theme').value = currentSettings.theme;

  // Populate group dropdown
  populateGroupDropdown();

  // Load active group
  loadGroup(currentSettings.activeGroup);

  // Update similarity value display when slider moves
  document.getElementById('minSimilarity').addEventListener('input', (e) => {
    document.getElementById('similarityValue').textContent = e.target.value + '%';
  });

  // Event listeners
  document.getElementById('activeGroup').addEventListener('change', handleGroupChange);
  document.getElementById('newGroup').addEventListener('click', createNewGroup);
  document.getElementById('deleteGroup').addEventListener('click', deleteGroup);
  document.getElementById('groupName').addEventListener('blur', updateGroupName);
  document.getElementById('save').addEventListener('click', saveSettings);
});

// Load settings from Chrome storage
async function loadSettings() {
  return new Promise((resolve) => {
    chrome.storage.sync.get(DEFAULT_SETTINGS, (items) => {
      // Migrate old format to new groups format
      if (!items.groups && items.rssFeeds) {
        items.groups = {
          'default': {
            name: 'Default',
            feeds: items.rssFeeds,
            minSimilarity: items.minSimilarity || 0.1
          }
        };
        items.activeGroup = 'default';
      }
      resolve(items);
    });
  });
}

// Populate group dropdown
function populateGroupDropdown() {
  const select = document.getElementById('activeGroup');
  select.innerHTML = '';

  Object.keys(currentSettings.groups).forEach(groupId => {
    const group = currentSettings.groups[groupId];
    const option = document.createElement('option');
    option.value = groupId;
    option.textContent = group.name;
    select.appendChild(option);
  });

  select.value = currentSettings.activeGroup;
}

// Load a specific group's settings
function loadGroup(groupId) {
  const group = currentSettings.groups[groupId];
  if (!group) return;

  document.getElementById('groupName').value = group.name;
  document.getElementById('rssFeeds').value = group.feeds.join('\n');

  const similarityPercent = Math.round(group.minSimilarity * 100);
  document.getElementById('minSimilarity').value = similarityPercent;
  document.getElementById('similarityValue').textContent = similarityPercent + '%';

  // Update button states
  document.getElementById('deleteGroup').disabled = Object.keys(currentSettings.groups).length === 1;
}

// Handle group dropdown change
function handleGroupChange(e) {
  // Save current group before switching
  saveCurrentGroup();

  // Load new group
  currentSettings.activeGroup = e.target.value;
  loadGroup(e.target.value);
}

// Save current group's data (without syncing to storage)
function saveCurrentGroup() {
  const groupId = currentSettings.activeGroup;
  const group = currentSettings.groups[groupId];

  if (!group) return;

  const feedsText = document.getElementById('rssFeeds').value.trim();
  const feeds = feedsText
    .split('\n')
    .map(url => url.trim())
    .filter(url => url.length > 0);

  const similarityPercent = parseInt(document.getElementById('minSimilarity').value);

  group.feeds = feeds.length > 0 ? feeds : DEFAULT_SETTINGS.groups.default.feeds;
  group.minSimilarity = similarityPercent / 100;
}

// Update group name
function updateGroupName() {
  const groupId = currentSettings.activeGroup;
  const newName = document.getElementById('groupName').value.trim();

  if (newName && currentSettings.groups[groupId]) {
    currentSettings.groups[groupId].name = newName;
    populateGroupDropdown();
  }
}

// Create new group
function createNewGroup() {
  const groupId = 'group_' + Date.now();
  const groupName = prompt('Enter group name:', 'New Group');

  if (!groupName) return;

  currentSettings.groups[groupId] = {
    name: groupName,
    feeds: ['https://www.mirrorindy.org/feed'],
    minSimilarity: 0.1
  };

  currentSettings.activeGroup = groupId;
  populateGroupDropdown();
  loadGroup(groupId);

  showStatus('New group created! Click Save to keep it.', 'success');
}

// Delete current group
function deleteGroup() {
  if (Object.keys(currentSettings.groups).length === 1) {
    showStatus('Cannot delete the last group', 'error');
    return;
  }

  const groupId = currentSettings.activeGroup;
  const groupName = currentSettings.groups[groupId].name;

  if (!confirm(`Delete group "${groupName}"?`)) {
    return;
  }

  delete currentSettings.groups[groupId];

  // Switch to first available group
  currentSettings.activeGroup = Object.keys(currentSettings.groups)[0];
  populateGroupDropdown();
  loadGroup(currentSettings.activeGroup);

  showStatus('Group deleted! Click Save to confirm.', 'success');
}

// Save all settings to Chrome storage
async function saveSettings() {
  // Save current group data first
  saveCurrentGroup();

  // Get general settings
  const settings = {
    enabled: document.getElementById('enabled').checked,
    position: document.getElementById('position').value,
    size: document.getElementById('size').value,
    theme: document.getElementById('theme').value,
    activeGroup: currentSettings.activeGroup,
    groups: currentSettings.groups
  };

  // For backward compatibility, also save flat structure
  const activeGroup = settings.groups[settings.activeGroup];
  settings.rssFeeds = activeGroup.feeds;
  settings.minSimilarity = activeGroup.minSimilarity;

  chrome.storage.sync.set(settings, () => {
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
