// Auto Generator for labs.google v5.0 - runs in PAGE context
// NEW: Auto-click on Flow UI settings (aspect ratio, model) before generating

(function() {// 
  
  let promptQueue = [];
  let currentIndex = 0;
  let isRunning = false;
  let settings = { 
    delayBetweenPrompts: 5000,
    aspectRatio: '16:9',
    model: 'veo_3_1_t2v_fast_ultra_relaxed',
    outputsPerPrompt: 1
  };
  
  function isOurElement(el) {
    if (!el) return false;
    let current = el;
    while (current) {
      if (current.id?.startsWith('veo-')) return true;
      current = current.parentElement;
    }
    return false;
  }
  
  function sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  function findPromptInput() {
    const pinnedInput = document.getElementById('PINHOLE_TEXT_AREA_ELEMENT_ID');
    if (pinnedInput) return pinnedInput;
    
    const textareas = document.querySelectorAll('textarea');
    for (const ta of textareas) {
      if (ta.offsetHeight > 40 && ta.offsetWidth > 200 && !isOurElement(ta)) {
        return ta;
      }
    }
    return null;
  }
  
  function findGenerateButton() {
    const allButtons = Array.from(document.querySelectorAll('button'));
    const input = findPromptInput();
    
    if (!input) return null;
    
    const inputRect = input.getBoundingClientRect();
    
    for (const btn of allButtons) {
      if (btn.disabled || btn.offsetParent === null || isOurElement(btn)) continue;
      
      const btnRect = btn.getBoundingClientRect();
      const text = (btn.textContent || '').trim();
      
      const isNearBottom = btnRect.top >= inputRect.top && btnRect.top <= inputRect.bottom + 150;
      const isOnRight = btnRect.left >= inputRect.left;
      
      if (isNearBottom && isOnRight) {
        const hasArrowText = text.includes('arrow') || 
                            text.includes('forward') || 
                            text.includes('Tạo') ||
                            text.includes('send');
        
        if (hasArrowText) return btn;
      }
    }
    
    return null;
  }
  
  // ===== FIND SETTINGS BUTTON (tune icon) =====
  function findSettingsButton() {
    const allButtons = Array.from(document.querySelectorAll('button'));
    
    for (const btn of allButtons) {
      if (btn.disabled || btn.offsetParent === null || isOurElement(btn)) continue;
      
      const text = (btn.textContent || '').trim().toLowerCase();
      
      // Look for tune/settings icon button
      if (text.includes('tune') || text.includes('cài đặt') || text.includes('settings')) {// 
        return btn;
      }
    }
    
    // Also look for the icon near the Generate button
    const input = findPromptInput();
    if (input) {
      const inputRect = input.getBoundingClientRect();
      
      for (const btn of allButtons) {
        if (btn.disabled || btn.offsetParent === null || isOurElement(btn)) continue;
        
        const btnRect = btn.getBoundingClientRect();
        const text = (btn.textContent || '').trim();
        
        // Settings button is usually near the input, small, and has icon
        const isNear = btnRect.top >= inputRect.top - 50 && btnRect.top <= inputRect.bottom + 100;
        const isSmall = btnRect.width < 60;
        
        if (isNear && isSmall && (text.includes('tune') || text === '')) {// 
          return btn;
        }
      }
    }
    
    return null;
  }
  
  // ===== CLICK A BUTTON =====
  async function clickElement(el) {
    if (!el) return false;
    
    el.focus();
    
    const rect = el.getBoundingClientRect();
    const eventInit = {
      bubbles: true,
      cancelable: true,
      view: window,
      clientX: rect.left + rect.width / 2,
      clientY: rect.top + rect.height / 2
    };
    
    el.dispatchEvent(new MouseEvent('mousedown', eventInit));
    await sleep(50);
    el.dispatchEvent(new MouseEvent('mouseup', eventInit));
    el.dispatchEvent(new MouseEvent('click', eventInit));
    el.click();
    
    return true;
  }
  
  // ===== FIND AND SELECT DROPDOWN OPTION =====
  async function selectDropdownOption(dropdownButton, optionText) {// 
    
    // Click to open dropdown
    await clickElement(dropdownButton);
    await sleep(300);
    
    // Find the option in the dropdown menu
    // Options are typically in a listbox or menu
    const options = document.querySelectorAll('[role="option"], [role="menuitem"], .MuiMenuItem-root, [class*="option"], [class*="select"]');
    
    for (const opt of options) {
      const text = (opt.textContent || '').toLowerCase();
      if (text.includes(optionText.toLowerCase())) {// 
        await clickElement(opt);
        await sleep(200);
        return true;
      }
    }
    
    // Fallback: Look for any clickable element with the text
    const allElements = document.querySelectorAll('*');
    for (const el of allElements) {
      if (el.offsetParent === null) continue;
      const text = (el.textContent || '').toLowerCase();
      if (text.includes(optionText.toLowerCase()) && el.tagName !== 'BUTTON') {
        const rect = el.getBoundingClientRect();
        if (rect.width > 50 && rect.height > 20) {// 
          await clickElement(el);
          await sleep(200);
          return true;
        }
      }
    }// 
    return false;
  }
  
  // ===== APPLY SETTINGS VIA UI =====
  async function applySettingsViaUI() {// 
    
    // Find and click settings button to open panel
    const settingsBtn = findSettingsButton();
    if (!settingsBtn) {// 
      return;
    }
    
    await clickElement(settingsBtn);
    await sleep(500);
    
    // Find dropdowns in the settings panel
    // Look for dropdown buttons with aspect ratio text
    const allButtons = Array.from(document.querySelectorAll('button'));
    
    // Find aspect ratio dropdown
    for (const btn of allButtons) {
      const text = (btn.textContent || '').toLowerCase();
      
      // Aspect ratio dropdown
      if (text.includes('khổ ngang') || text.includes('khổ dọc') || 
          text.includes('16:9') || text.includes('9:16') ||
          text.includes('landscape') || text.includes('portrait')) {
        
        const targetRatio = settings.aspectRatio === '9:16' ? 'khổ dọc' : 'khổ ngang';
        
        if (!text.includes(targetRatio)) {// 
          await selectDropdownOption(btn, targetRatio);
          await sleep(300);
        } else {// 
        }
        break;
      }
    }
    
    // Find model dropdown
    for (const btn of allButtons) {
      const text = (btn.textContent || '').toLowerCase();
      
      if (text.includes('veo 3.1') || text.includes('veo 3') || text.includes('mô hình')) {
        // Determine target model text
        let targetModel = 'lower priority';
        if (settings.model === 'veo_3_1_t2v_fast') {
          targetModel = 'fast';
        } else if (settings.model === 'veo_3_t2v') {
          targetModel = 'veo 3.0';
        }// 
        // Only change if needed
        break;
      }
    }
    
    // Close settings by clicking elsewhere
    const backdrop = document.querySelector('[class*="backdrop"], [class*="overlay"]');
    if (backdrop) {
      await clickElement(backdrop);
    } else {
      // Click on the page body
      document.body.click();
    }
    await sleep(300);// 
  }
  
  function setPromptValue(input, value) {
    if (!input) return false;
    
    try {
      input.focus();
      
      const nativeSetter = Object.getOwnPropertyDescriptor(
        window.HTMLTextAreaElement.prototype, 'value'
      ).set;
      
      nativeSetter.call(input, value);
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));// 
      return true;
    } catch (e) {
      console.error('🤖 Error:', e);
      return false;
    }
  }
  
  async function processNextPrompt() {
    if (!isRunning) return;
    
    if (currentIndex >= promptQueue.length) {// 
      isRunning = false;
      window.postMessage({ type: 'veoAutoGen_complete', total: promptQueue.length }, '*');
      return;
    }
    
    const promptData = promptQueue[currentIndex];
    const promptText = promptData.text || promptData;// 
    
    // Apply settings via UI on first prompt
    if (currentIndex === 0) {
      await applySettingsViaUI();
    }
    
    // Notify content script BEFORE clicking
    window.postMessage({
      type: 'veoAutoGen_processingStart',
      index: currentIndex
    }, '*');
    
    const input = findPromptInput();
    if (!input) {
      setTimeout(processNextPrompt, 2000);
      return;
    }
    
    setPromptValue(input, promptText);// 
    await sleep(1500);
    
    const btn = findGenerateButton();
    if (!btn) {// 
      setTimeout(processNextPrompt, 2000);
      return;
    }
    
    await clickElement(btn);// 
    
    currentIndex++;
    
    window.postMessage({ 
      type: 'veoAutoGen_promptProcessed', 
      index: currentIndex - 1 
    }, '*');
    
    window.postMessage({ 
      type: 'veoAutoGen_progress', 
      current: currentIndex, 
      total: promptQueue.length 
    }, '*');// 
    setTimeout(processNextPrompt, settings.delayBetweenPrompts);
  }
  
  function start(prompts, newSettings = {}) {
    promptQueue = prompts;
    currentIndex = 0;
    settings = { ...settings, ...newSettings };
    isRunning = true;// // 
    processNextPrompt();
  }
  
  function stop() {
    isRunning = false;
    window.postMessage({ type: 'veoAutoGen_stopped', processed: currentIndex, total: promptQueue.length }, '*');
  }
  
  function debug() {// 
    const input = findPromptInput();// 
    const btn = findGenerateButton();// 
    const settingsBtn = findSettingsButton();// 
    return { input, btn, settingsBtn };
  }
  
  window.addEventListener('message', (event) => {
    if (event.source !== window) return;
    switch (event.data?.type) {
      case 'veoAutoGen_start': start(event.data.prompts, event.data.settings); break;
      case 'veoAutoGen_stop': stop(); break;
    }
  });
  
  window.__veoAutoGen = { 
    start, stop, debug, 
    findInput: findPromptInput, 
    findButton: findGenerateButton, 
    findSettings: findSettingsButton,
    applySettings: applySettingsViaUI,
    click: () => clickElement(findGenerateButton()) 
  };// 
})();

