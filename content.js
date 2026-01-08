// Content script for Flow Token Harvester
// This runs in the context of web pages and bridges messages between page and extension

// Listen for messages from the web page
window.addEventListener('message', async (event) => {
  // Only accept messages from the same window
  if (event.source !== window) return;
  
  // Check if this is a proxy request
  if (event.data && event.data.type === 'FLOW_HARVESTER_PROXY') {// 
    
    const { url, payload, bearerToken, recaptchaToken } = event.data;
    
    // Forward to background script
    chrome.runtime.sendMessage({
      action: 'proxyRequest',
      url: url,
      payload: payload,
      bearerToken: bearerToken,
      recaptchaToken: recaptchaToken
    }, (response) => {
      // Send response back to page
      window.postMessage({
        type: 'FLOW_HARVESTER_RESPONSE',
        response: response,
        requestId: event.data.requestId
      }, '*');
    });
  }
  
  // Check for extension ID request
  if (event.data && event.data.type === 'FLOW_HARVESTER_GET_ID') {
    // Send extension ID back to page
    window.postMessage({
      type: 'FLOW_HARVESTER_ID',
      extensionId: chrome.runtime.id
    }, '*');
  }
});

// Announce extension presence to page
window.postMessage({
  type: 'FLOW_HARVESTER_READY',
  extensionId: chrome.runtime.id
}, '*');// 

