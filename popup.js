// VEO Token Sync - Popup Script v6.0

document.addEventListener('DOMContentLoaded', () => {
  // Display Extension ID
  document.getElementById('extensionId').textContent = chrome.runtime.id;
  
  // Load tokens
  loadTokens();
  
  // Auto-refresh every 2 seconds
  setInterval(loadTokens, 2000);
  
  // Initialize event handlers
  initEventHandlers();
});

// ==================== EVENT HANDLERS ====================
function initEventHandlers() {
  document.getElementById('syncToCloudBtn').addEventListener('click', syncToCloud);
  document.getElementById('copyTokensBtn').addEventListener('click', copyTokens);
  document.getElementById('clearTokensBtn').addEventListener('click', clearTokens);
}

// ==================== TOKEN MANAGEMENT ====================
function loadTokens() {
  chrome.runtime.sendMessage({ action: 'getTokens' }, (tokens) => {
    const bearerEl = document.getElementById('bearerToken');
    const recaptchaEl = document.getElementById('recaptchaToken');
    const bearerStatus = document.getElementById('bearerStatus');
    const recaptchaStatus = document.getElementById('recaptchaStatus');
    const timestampEl = document.getElementById('tokenTimestamp');
    
    if (tokens?.bearer) {
      bearerEl.textContent = tokens.bearer;
      bearerEl.style.color = '#4CAF50';
      bearerStatus.textContent = '✓ Captured';
      bearerStatus.className = 'badge success';
    } else {
      bearerEl.textContent = 'No token - Generate on labs.google/fx';
      bearerEl.style.color = '#888';
      bearerStatus.textContent = 'Not captured';
      bearerStatus.className = 'badge';
    }
    
    if (tokens?.recaptcha) {
      recaptchaEl.textContent = tokens.recaptcha;
      recaptchaEl.style.color = '#4CAF50';
      recaptchaStatus.textContent = '✓ Captured';
      recaptchaStatus.className = 'badge success';
      
      // Check if expired (> 2 mins)
      if (tokens.timestamp) {
        const age = (Date.now() - tokens.timestamp) / 1000;
        if (age > 120) {
          recaptchaEl.style.color = '#ff6b6b';
          recaptchaStatus.textContent = '⚠️ Expired';
          recaptchaStatus.className = 'badge warning';
        }
      }
    } else {
      recaptchaEl.textContent = 'No token - Generate on labs.google/fx';
      recaptchaEl.style.color = '#888';
      recaptchaStatus.textContent = 'Not captured';
      recaptchaStatus.className = 'badge';
    }
    
    if (tokens?.timestamp) {
      const date = new Date(tokens.timestamp);
      timestampEl.textContent = `Last captured: ${date.toLocaleTimeString()}`;
    } else {
      timestampEl.textContent = '';
    }
  });
}

function copyTokens() {
  chrome.runtime.sendMessage({ action: 'getTokens' }, (tokens) => {
    if (tokens?.bearer && tokens?.recaptcha) {
      const text = `Bearer: ${tokens.bearer}\nreCAPTCHA: ${tokens.recaptcha}`;
      navigator.clipboard.writeText(text);
      showStatus('📋 Tokens copied!', 'success');
    } else {
      showStatus('No tokens to copy', 'error');
    }
  });
}

function clearTokens() {
  chrome.runtime.sendMessage({ action: 'clearTokens' });
  loadTokens();
  showStatus('🗑️ Tokens cleared', 'success');
}

// ==================== SYNC TO CLOUD ====================
const CLOUD_FUNCTION_URL = 'https://us-central1-week10-a16aa.cloudfunctions.net/updateToken';
const ADMIN_SECRET_KEY = 'veo3-admin-secret-2024';

async function syncToCloud() {
  const syncBtn = document.getElementById('syncToCloudBtn');
  const syncStatus = document.getElementById('syncStatus');
  
  syncBtn.disabled = true;
  syncBtn.textContent = '⏳ Syncing...';
  syncStatus.textContent = 'Getting fresh reCAPTCHA from labs.google...';
  syncStatus.className = 'status-msg';
  
  try {
    // Get stored tokens
    const tokens = await new Promise(resolve => {
      chrome.runtime.sendMessage({ action: 'getTokens' }, resolve);
    });
    
    if (!tokens?.bearer) {
      throw new Error('No Bearer token. Open labs.google/fx and generate something first.');
    }
    
    // Get fresh reCAPTCHA token from labs.google tab
    let recaptchaToken = tokens.recaptcha;
    let sessionId = tokens.sessionId;
    let projectId = tokens.projectId;
    
    // Try to get fresh reCAPTCHA from active labs.google tab
    try {
      const tabs = await chrome.tabs.query({ url: 'https://labs.google/*' });
      if (tabs.length > 0 && tabs[0].id) {
        syncStatus.textContent = 'Getting fresh reCAPTCHA...';
        
        // Wrap in Promise to handle timeout
        const freshResponse = await Promise.race([
          chrome.tabs.sendMessage(tabs[0].id, {
            action: 'generateRecaptchaToken',
            actionName: 'FLOW_GENERATION'
          }),
          new Promise((_, reject) => setTimeout(() => reject(new Error('Timeout')), 5000))
        ]).catch(e => {// 
          return null;
        });
        
        if (freshResponse?.success && freshResponse?.token) {
          recaptchaToken = freshResponse.token;// 
        } else {// 
        }
        
        // Extract projectId from URL if available
        if (tabs[0].url) {
          const match = tabs[0].url.match(/\/project\/([a-f0-9-]+)/i);
          if (match) {
            projectId = match[1];// 
          }
        }
      } else {// 
      }
    } catch (e) {// 
      // Continue with stored reCAPTCHA token
    }
    
    if (!recaptchaToken) {
      throw new Error('No reCAPTCHA token. Open labs.google/fx and generate something first.');
    }
    
    syncStatus.textContent = 'Uploading to Cloud...';
    
    // Send to Cloud Function
    const response = await fetch(CLOUD_FUNCTION_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        adminKey: ADMIN_SECRET_KEY,
        token: tokens.bearer.startsWith('Bearer ') ? tokens.bearer : 'Bearer ' + tokens.bearer,
        recaptchaToken: recaptchaToken,
        sessionId: sessionId,
        projectId: projectId
      })
    });
    
    const data = await response.json();
    
    if (response.ok) {
      syncStatus.textContent = '✅ Token synced to Cloud!';
      syncStatus.className = 'status-msg success';
    } else {
      throw new Error(data.message || 'Sync failed');
    }
    
  } catch (error) {
    syncStatus.textContent = '❌ ' + error.message;
    syncStatus.className = 'status-msg error';
  } finally {
    syncBtn.disabled = false;
    syncBtn.textContent = '☁️ Sync Token to Cloud';
  }
}

// ==================== UTILITIES ====================
function copyExtensionId() {
  navigator.clipboard.writeText(chrome.runtime.id);
  showStatus('📋 Extension ID copied!', 'success');
}
window.copyExtensionId = copyExtensionId;

function showStatus(msg, type) {
  const syncStatus = document.getElementById('syncStatus');
  syncStatus.textContent = msg;
  syncStatus.className = 'status-msg ' + type;
  setTimeout(() => {
    syncStatus.textContent = '';
    syncStatus.className = 'status-msg';
  }, 3000);
}

