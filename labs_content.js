// Content script for labs.google v5.23
// BATCH PROCESSING + AUTO GENERATION MODE
// FIXED: Proper queue sync with auto_generator// 

// ===== STATE MANAGEMENT =====
let promptQueue = [];
let currentIndex = 0;
let isAutoMode = false;
let processingIndex = -1; // The prompt currently being processed
let settings = {
  aspectRatio: '16:9',
  duration: 8,
  model: 'veo31fast',
  delayBetweenPrompts: 5000,
  outputCount: 1
};

// ===== MESSAGE HANDLERS =====
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {// 
  
  // === BATCH: Add prompts to queue ===
  if (request.action === 'addToQueue') {
    const prompts = Array.isArray(request.prompts) ? request.prompts : [request.prompts];
    prompts.forEach(p => {
      promptQueue.push({
        text: typeof p === 'string' ? p : p.text || p.prompt,
        aspectRatio: p.aspectRatio || settings.aspectRatio,
        duration: p.duration || settings.duration,
        status: 'queued'
      });
    });// 
    updateOverlay();
    sendResponse({ success: true, queueLength: promptQueue.length });
    return;
  }
  
  // === BATCH: Get queue status ===
  if (request.action === 'getQueueStatus') {
    sendResponse({
      queue: promptQueue,
      currentIndex,
      processingIndex,
      isAutoMode,
      settings
    });
    return;
  }
  
  // === NEW: Generate fresh reCAPTCHA token ===
  if (request.action === 'generateRecaptchaToken') {// 
    
    const handler = (event) => {
      if (event.data?.type === 'veo_recaptchaToken') {
        window.removeEventListener('message', handler);
        
        if (event.data.success && event.data.token) {// 
          sendResponse({ success: true, token: event.data.token });
        } else {
          sendResponse({ success: false, error: 'Token generation failed' });
        }
      }
    };
    
    window.addEventListener('message', handler);
    window.postMessage({ 
      type: 'veo_requestRecaptchaToken', 
      action: request.actionName || 'FLOW_GENERATION' 
    }, '*');
    
    setTimeout(() => window.removeEventListener('message', handler), 10000);
    return true;
  }
  
  // === NEW: Proxy API call through page context ===
  if (request.action === 'proxyApiCall') {
    // Generate unique request ID to prevent race conditions
    const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(7)}`;// // // 
    
    const handler = (event) => {
      // Only handle response that matches OUR request ID
      if (event.data?.type === 'veo_apiCallResult' && event.data.requestId === requestId) {
        window.removeEventListener('message', handler);// 
        
        if (event.data.success) {
          sendResponse({
            ok: event.data.ok,
            status: event.data.status,
            data: event.data.data
          });
        } else {
          sendResponse({ 
            success: false, 
            error: event.data.error || 'API call failed' 
          });
        }
      }
    };
    
    window.addEventListener('message', handler);
    
    // Send to interceptor.js for execution WITH requestId
    window.postMessage({ 
      type: 'veo_proxyApiCall',
      requestId: requestId,
      url: request.url,
      payload: request.payload,
      bearerToken: request.bearerToken
    }, '*');
    
    // Timeout after 60 seconds
    setTimeout(() => window.removeEventListener('message', handler), 60000);
    return true;
  }
  
  // === BATCH: Clear queue ===
  if (request.action === 'clearQueue') {
    promptQueue = [];
    currentIndex = 0;
    processingIndex = -1;
    updateOverlay();
    sendResponse({ success: true });
    return;
  }
  
  // === AUTO: Start auto generation ===
  if (request.action === 'startAutoGeneration') {
    if (request.prompts) {
      promptQueue = request.prompts.map(p => ({
        text: typeof p === 'string' ? p : p.text || p.prompt,
        aspectRatio: p.aspectRatio || settings.aspectRatio,
        duration: p.duration || settings.duration,
        status: 'queued'
      }));
    }
    if (request.settings) {
      settings = { ...settings, ...request.settings };
    }
    
    isAutoMode = true;
    currentIndex = 0;
    processingIndex = -1;
    
    // Inject auto_generator.js and start
    injectAutoGenerator(() => {
      window.postMessage({
        type: 'veoAutoGen_start',
        prompts: promptQueue,
        settings: settings
      }, '*');
    });
    
    updateOverlay();
    sendResponse({ success: true, message: 'Auto generation started' });
    return;
  }
  
  // === AUTO: Stop auto generation ===
  if (request.action === 'stopAutoGeneration') {
    isAutoMode = false;
    window.postMessage({ type: 'veoAutoGen_stop' }, '*');
    updateOverlay();
    sendResponse({ success: true });
    return;
  }
  
  // === SETTINGS: Update settings ===
  if (request.action === 'updateSettings') {
    settings = { ...settings, ...request.settings };
    window.postMessage({
      type: 'veoAutoGen_updateSettings',
      settings: settings
    }, '*');
    sendResponse({ success: true, settings });
    return;
  }
  
  // === LEGACY: Queue single video request (v5.23 compatibility) ===
  if (request.action === 'queueVideoRequest') {
    promptQueue.push({
      text: request.prompt,
      aspectRatio: request.aspectRatio || '16:9',
      duration: request.duration || 8,
      status: 'queued'
    });
    updateOverlay();
    showNotification('✅ Prompt added to queue! Click Generate or enable Auto Mode.');
    sendResponse({ queued: true, queueLength: promptQueue.length });
    return;
  }
});

// ===== AUTO GENERATOR INJECTION =====
let autoGeneratorInjected = false;

function injectAutoGenerator(callback) {
  if (autoGeneratorInjected) {
    callback?.();
    return;
  }
  
  const script = document.createElement('script');
  script.src = chrome.runtime.getURL('auto_generator.js');
  script.onload = () => {// 
    autoGeneratorInjected = true;
    script.remove();
    setTimeout(callback, 100);
  };
  (document.head || document.documentElement).appendChild(script);
}

// ===== INTERCEPTOR INJECTION =====
const interceptorScript = document.createElement('script');
interceptorScript.src = chrome.runtime.getURL('interceptor.js');
interceptorScript.onload = () => {// 
  interceptorScript.remove();
};
(document.head || document.documentElement).appendChild(interceptorScript);

// ===== PAGE MESSAGE HANDLERS =====
window.addEventListener('message', (event) => {
  if (event.source !== window) return;
  
  // === SYNC: Auto generator is about to click for a specific prompt ===
  if (event.data?.type === 'veoAutoGen_processingStart') {
    processingIndex = event.data.index;// 
  }
  
  // === SYNC: Auto generator asks which prompt to process next ===
  if (event.data?.type === 'veoAutoGen_getNextPrompt') {
    if (currentIndex < promptQueue.length) {
      processingIndex = currentIndex;
      const prompt = promptQueue[currentIndex];// 
      window.postMessage({
        type: 'veoAutoGen_nextPrompt',
        index: currentIndex,
        prompt: prompt,
        total: promptQueue.length
      }, '*');
    } else {
      window.postMessage({ type: 'veoAutoGen_queueEmpty' }, '*');
    }
  }
  
  // === SYNC: Auto generator completed a prompt, advance index ===
  if (event.data?.type === 'veoAutoGen_promptProcessed') {
    const idx = event.data.index;
    if (promptQueue[idx]) {
      promptQueue[idx].status = 'processing';
    }
    currentIndex = idx + 1;
    updateOverlay();
  }
  
  // Forward pending info to interceptor (for fetch modification)
  if (event.data?.type === 'flowHarvester_getPending') {
    // Use processingIndex - the prompt currently being clicked
    const prompt = processingIndex >= 0 ? promptQueue[processingIndex] : null;// 
    window.postMessage({
      type: 'flowHarvester_pendingInfo',
      video: prompt ? {
        prompt: prompt.text,
        aspectRatio: prompt.aspectRatio || settings.aspectRatio,
        duration: prompt.duration || settings.duration,
        model: prompt.model || settings.model
      } : null,
      image: null
    }, '*');
  }
  
  // Video response from interceptor
  if (event.data?.type === 'flowHarvester_videoResponse') {// 
    
    if (processingIndex >= 0 && promptQueue[processingIndex]) {
      promptQueue[processingIndex].status = event.data.success ? 'completed' : 'failed';
    }
    
    // Clear processing index
    processingIndex = -1;
    
    // If not auto mode, advance manually
    if (!isAutoMode && event.data.success) {
      currentIndex++;
      updateOverlay();
      showNotification(`✅ Video ${currentIndex}/${promptQueue.length} queued!`);
    }
  }
  
  // Auto generator progress
  if (event.data?.type === 'veoAutoGen_progress') {
    updateOverlay();
    showNotification(`🎬 Processing ${event.data.current}/${event.data.total}...`);
  }
  
  // Auto generator complete
  if (event.data?.type === 'veoAutoGen_complete') {
    isAutoMode = false;
    processingIndex = -1;
    showNotification(`✅ All ${event.data.total} prompts submitted!`);
    updateOverlay();
    
    // Notify background/popup
    chrome.runtime.sendMessage({
      action: 'batchComplete',
      total: event.data.total
    });
  }
  
  // Auto generator stopped
  if (event.data?.type === 'veoAutoGen_stopped') {
    isAutoMode = false;
    processingIndex = -1;
    updateOverlay();
    showNotification(`⏹️ Stopped at ${event.data.processed}/${event.data.total}`);
  }
});

// ===== UI OVERLAY =====
let overlayElement = null;

function createOverlay() {
  if (overlayElement) return overlayElement;
  
  const overlay = document.createElement('div');
  overlay.id = 'veo-batch-overlay';
  overlay.style.cssText = `
    position: fixed;
    bottom: 20px;
    right: 20px;
    background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%);
    color: white;
    padding: 16px 20px;
    border-radius: 16px;
    font-family: 'Inter', -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 13px;
    z-index: 999999;
    box-shadow: 0 10px 40px rgba(0,0,0,0.4), 0 0 20px rgba(102,126,234,0.2);
    border: 1px solid rgba(255,255,255,0.1);
    min-width: 280px;
    max-width: 350px;
    backdrop-filter: blur(10px);
  `;
  
  document.body.appendChild(overlay);
  overlayElement = overlay;
  return overlay;
}

function updateOverlay() {
  const overlay = createOverlay();
  
  const remaining = promptQueue.length - currentIndex;
  const completed = currentIndex;
  const percent = promptQueue.length > 0 ? Math.round((currentIndex / promptQueue.length) * 100) : 0;
  
  overlay.innerHTML = `
    <div style="display: flex; align-items: center; gap: 10px; margin-bottom: 12px;">
      <div style="font-size: 18px;">${isAutoMode ? '🚀' : '📋'}</div>
      <div>
        <div style="font-weight: 600; font-size: 14px;">VEO Batch Processor</div>
        <div style="font-size: 11px; opacity: 0.7;">${isAutoMode ? 'Auto Mode Active' : 'Manual Mode'}</div>
      </div>
    </div>
    
    <div style="background: rgba(255,255,255,0.1); border-radius: 8px; padding: 12px; margin-bottom: 12px;">
      <div style="display: flex; justify-content: space-between; margin-bottom: 8px;">
        <span>Progress</span>
        <span style="font-weight: 600;">${completed}/${promptQueue.length}</span>
      </div>
      <div style="background: rgba(255,255,255,0.2); border-radius: 4px; height: 6px; overflow: hidden;">
        <div style="background: linear-gradient(90deg, #667eea, #764ba2); height: 100%; width: ${percent}%; transition: width 0.3s;"></div>
      </div>
    </div>
    
    ${remaining > 0 ? `
      <div style="font-size: 11px; opacity: 0.8; margin-bottom: 10px;">
        Next: "${(promptQueue[currentIndex]?.text || '').substring(0, 40)}..."
      </div>
    ` : ''}
    
    <div style="display: flex; gap: 8px;">
      ${!isAutoMode && remaining > 0 ? `
        <button id="veo-start-auto" style="
          flex: 1; padding: 8px 12px; border: none; border-radius: 8px;
          background: linear-gradient(135deg, #667eea, #764ba2);
          color: white; cursor: pointer; font-weight: 500; font-size: 12px;
        ">▶️ Start Auto</button>
      ` : ''}
      ${isAutoMode ? `
        <button id="veo-stop-auto" style="
          flex: 1; padding: 8px 12px; border: none; border-radius: 8px;
          background: #ff4444;
          color: white; cursor: pointer; font-weight: 500; font-size: 12px;
        ">⏹️ Stop</button>
      ` : ''}
      <button id="veo-minimize" style="
        padding: 8px 12px; border: none; border-radius: 8px;
        background: rgba(255,255,255,0.1);
        color: white; cursor: pointer; font-size: 12px;
      ">−</button>
    </div>
  `;
  
  // Hide overlay if queue is empty
  overlay.style.display = promptQueue.length > 0 ? 'block' : 'none';
  
  // Attach event handlers
  const startBtn = overlay.querySelector('#veo-start-auto');
  const stopBtn = overlay.querySelector('#veo-stop-auto');
  const minimizeBtn = overlay.querySelector('#veo-minimize');
  
  startBtn?.addEventListener('click', () => {
    injectAutoGenerator(() => {
      isAutoMode = true;
      window.postMessage({
        type: 'veoAutoGen_start',
        prompts: promptQueue.slice(currentIndex),
        settings: settings
      }, '*');
      updateOverlay();
    });
  });
  
  stopBtn?.addEventListener('click', () => {
    isAutoMode = false;
    window.postMessage({ type: 'veoAutoGen_stop' }, '*');
    updateOverlay();
  });
  
  minimizeBtn?.addEventListener('click', () => {
    overlay.style.display = 'none';
  });
}

// ===== NOTIFICATIONS =====
function showNotification(message, duration = 4000) {
  const existing = document.getElementById('veo-notification');
  if (existing) existing.remove();
  
  const div = document.createElement('div');
  div.id = 'veo-notification';
  div.style.cssText = `
    position: fixed;
    top: 20px;
    right: 20px;
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white;
    padding: 14px 20px;
    border-radius: 12px;
    font-family: -apple-system, BlinkMacSystemFont, sans-serif;
    font-size: 14px;
    font-weight: 500;
    z-index: 9999999;
    box-shadow: 0 10px 40px rgba(0,0,0,0.3);
    animation: slideIn 0.3s ease-out;
    max-width: 350px;
  `;
  div.innerHTML = message;
  document.body.appendChild(div);
  
  // Add animation
  const style = document.createElement('style');
  style.id = 'veo-notification-style';
  if (!document.getElementById('veo-notification-style')) {
    style.textContent = `
      @keyframes slideIn {
        from { transform: translateX(100px); opacity: 0; }
        to { transform: translateX(0); opacity: 1; }
      }
    `;
    document.head.appendChild(style);
  }
  
  setTimeout(() => div.remove(), duration);
}

// ===== INITIALIZATION =====
chrome.runtime.sendMessage({ action: 'contentScriptReady', version: '4.5' });// 






















