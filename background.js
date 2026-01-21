// VEO Token Sync - Background Service Worker v6.0
// Captures: Bearer token, reCAPTCHA token, sessionId, projectId, tool
// Provides tokens to external web apps via externally_connectable

let latestTokens = {
  bearer: null,
  recaptcha: null,
  sessionId: null,
  projectId: null,
  tool: null,
  timestamp: null,
};

// Listen for requests to Google's AI Sandbox - capture body for reCAPTCHA and context
chrome.webRequest.onBeforeRequest.addListener(
  (details) => {
    // Match both image and video generation endpoints
    const isImageGen = details.url.includes("flowMedia:batchGenerateImages");
    const isVideoGen = details.url.includes("video:batchAsync");

    if (
      details.url.includes("aisandbox-pa.googleapis.com") &&
      (isImageGen || isVideoGen)
    ) {
      // Get request body
      if (details.requestBody && details.requestBody.raw) {
        try {
          const decoder = new TextDecoder("utf-8");
          const bodyText = decoder.decode(details.requestBody.raw[0].bytes);
          const body = JSON.parse(bodyText);

          // Extract from top-level clientContext first
          let clientContext = body.clientContext || {};

          // Fallback to first request's clientContext
          if (
            !clientContext.recaptchaToken &&
            !clientContext.recaptchaContext &&
            body.requests &&
            body.requests[0]
          ) {
            clientContext = body.requests[0].clientContext || clientContext;
          }

          // Support both OLD (recaptchaToken) and NEW (recaptchaContext.token) API formats
          const recaptcha =
            clientContext.recaptchaToken ||
            (clientContext.recaptchaContext &&
              clientContext.recaptchaContext.token);
          const sessionId = clientContext.sessionId;
          const projectId = clientContext.projectId;
          const tool = clientContext.tool;

          if (recaptcha) {
            latestTokens.recaptcha = recaptcha;
            latestTokens.sessionId = sessionId;
            latestTokens.projectId = projectId;
            latestTokens.tool = tool;
            latestTokens.timestamp = Date.now(); // // // // //

            // Save to storage
            chrome.storage.local.set({ latestTokens });

            // Update badge
            chrome.action.setBadgeText({ text: "✓" });
            chrome.action.setBadgeBackgroundColor({ color: "#4CAF50" });
          }
        } catch (e) {
          console.error("Parse error:", e);
        }
      }
    }
  },
  { urls: ["https://aisandbox-pa.googleapis.com/*"] },
  ["requestBody"],
);

// Listen for request headers to capture Bearer token
chrome.webRequest.onBeforeSendHeaders.addListener(
  (details) => {
    if (details.url.includes("aisandbox-pa.googleapis.com")) {
      const authHeader = details.requestHeaders.find(
        (h) => h.name.toLowerCase() === "authorization",
      );

      if (authHeader && authHeader.value.startsWith("Bearer ")) {
        latestTokens.bearer = authHeader.value.replace("Bearer ", "");
        latestTokens.timestamp = Date.now(); //

        // Save to storage
        chrome.storage.local.set({ latestTokens });
      }
    }
  },
  { urls: ["https://aisandbox-pa.googleapis.com/*"] },
  ["requestHeaders"],
);

// Handle messages from popup and content scripts (internal)
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "getTokens") {
    chrome.storage.local.get(["latestTokens"], (result) => {
      sendResponse(result.latestTokens || latestTokens);
    });
    return true; // async response
  }

  if (request.action === "clearTokens") {
    latestTokens = {
      bearer: null,
      recaptcha: null,
      sessionId: null,
      projectId: null,
      tool: null,
      timestamp: null,
    };
    chrome.storage.local.set({ latestTokens });
    chrome.action.setBadgeText({ text: "" });
    sendResponse({ success: true });
    return true;
  }

  // v3.0: Content script ready - just log it (interceptor.js is loaded as file)
  if (request.action === "contentScriptReady") {
    //
    chrome.action.setBadgeText({ text: "✓" });
    chrome.action.setBadgeBackgroundColor({ color: "#00C853" });
    return true;
  }

  if (request.action === "labsRecaptchaReady") {
    //
    chrome.action.setBadgeText({ text: "✓" });
    chrome.action.setBadgeBackgroundColor({ color: "#00C853" });
    return true;
  }
});

// This function is injected into the page context - v2.4
function injectGrecaptchaHelper(siteKey) {
  // //

  // Check if grecaptcha is ready
  function isReady() {
    return (
      typeof grecaptcha !== "undefined" &&
      typeof grecaptcha.enterprise !== "undefined" &&
      typeof grecaptcha.enterprise.execute === "function"
    );
  } //

  // Generate fresh token
  async function generateToken(actionName) {
    if (!isReady()) {
      throw new Error(
        "grecaptcha not ready. Click Generate on labs.google/fx first!",
      );
    }
    return new Promise((resolve, reject) => {
      grecaptcha.enterprise.ready(() => {
        grecaptcha.enterprise
          .execute(siteKey, { action: actionName })
          .then(resolve)
          .catch(reject);
      });
    });
  }

  // Make API call with fresh token - from page context!
  async function makeApiCall(url, payload, bearerToken) {
    // First get a fresh token//
    const freshToken = await generateToken("flow"); //

    // Update payload with fresh token
    if (payload.clientContext) {
      payload.clientContext.recaptchaToken = freshToken;
    }
    if (payload.requests && payload.requests[0]?.clientContext) {
      payload.requests[0].clientContext.recaptchaToken = freshToken;
    } //

    // Make the fetch from page context (same origin as token!)
    const response = await fetch(url, {
      method: "POST",
      credentials: "include",
      headers: {
        "Content-Type": "text/plain;charset=UTF-8",
        Authorization: bearerToken.startsWith("Bearer ")
          ? bearerToken
          : "Bearer " + bearerToken,
      },
      body: JSON.stringify(payload),
    });

    const data = await response.json(); //

    if (!response.ok) {
      //
    }

    return {
      ok: response.ok,
      status: response.status,
      data: data,
    };
  }

  // Listen for requests from content script
  window.addEventListener("message", async (event) => {
    if (event.source !== window) return;
    if (event.data?.type !== "flowHarvesterRequest") return;

    const { requestId, requestType, data } = event.data; //

    try {
      let result;

      if (requestType === "generateToken") {
        const token = await generateToken(data.actionName);
        result = { success: true, token };
      } else if (requestType === "apiCall") {
        const apiResult = await makeApiCall(
          data.url,
          data.payload,
          data.bearerToken,
        );
        result = apiResult;
      } else {
        result = { success: false, error: "Unknown request type" };
      }

      window.postMessage(
        {
          type: "flowHarvesterResponse",
          requestId: requestId,
          result: result,
        },
        "*",
      );
    } catch (err) {
      console.error("🔐 [PAGE] Error:", err);
      window.postMessage(
        {
          type: "flowHarvesterResponse",
          requestId: requestId,
          result: { success: false, error: err.message },
        },
        "*",
      );
    }
  });

  // Poll for grecaptcha and notify when ready
  let pollCount = 0;
  const poll = setInterval(() => {
    pollCount++;
    if (isReady()) {
      //
      clearInterval(poll);
    } else if (pollCount >= 15) {
      //
      clearInterval(poll);
    }
  }, 2000);
}

// === Handle messages from EXTERNAL web pages (localhost) ===
// This is needed for externally_connectable to work!
chrome.runtime.onMessageExternal.addListener(
  (request, sender, sendResponse) => {
    //

    // === ping - for auto-detection from deployed app ===
    if (request.action === "ping") {
      //
      sendResponse({
        success: true,
        version: "5.23",
        extensionName: "VEO Batch Processor",
      });
      return true;
    }

    // === getTokens - return stored tokens ===
    if (request.action === "getTokens") {
      //
      chrome.storage.local.get(["latestTokens"], (result) => {
        const tokens = result.latestTokens || latestTokens; //
        sendResponse(tokens);
      });
      return true;
    }

    // === NEW: Get captured Bearer token ===
    if (request.action === "getBearerToken") {
      //
      chrome.storage.local.get(["latestTokens"], (result) => {
        const tokens = result.latestTokens || latestTokens;
        if (tokens.bearer) {
          //
          sendResponse({
            success: true,
            token: tokens.bearer,
            timestamp: tokens.timestamp,
          });
        } else {
          sendResponse({
            success: false,
            error:
              "No Bearer token captured. Open labs.google/fx and generate something first.",
          });
        }
      });
      return true;
    }

    // === NEW: Get ALL tokens at once (Bearer + Fresh reCAPTCHA) ===
    if (request.action === "getAllTokens") {
      //

      // First get Bearer from storage
      chrome.storage.local.get(["latestTokens"], (result) => {
        const tokens = result.latestTokens || latestTokens;

        if (!tokens.bearer) {
          sendResponse({
            success: false,
            error:
              "No Bearer token. Open labs.google/fx and generate something first.",
          });
          return;
        }

        // Then get fresh reCAPTCHA token
        chrome.tabs.query({ url: "https://labs.google/*" }, (tabs) => {
          if (tabs.length === 0) {
            // Return Bearer only if no labs tab
            sendResponse({
              success: true,
              bearer: tokens.bearer,
              recaptcha: null,
              warning: "No labs.google tab open - reCAPTCHA may be stale",
            });
            return;
          }

          const labsTab = tabs[0];

          // Extract projectId from URL if not captured yet
          // URL format: https://labs.google/fx/vi/tools/flow/project/{projectId}
          let urlProjectId = null;
          if (labsTab.url) {
            const match = labsTab.url.match(/\/project\/([a-f0-9-]+)/i);
            if (match) {
              urlProjectId = match[1]; //
            }
          }

          chrome.tabs.sendMessage(
            labsTab.id,
            {
              action: "generateRecaptchaToken",
              actionName: request.actionName || "FLOW_GENERATION",
            },
            (response) => {
              if (chrome.runtime.lastError || !response?.success) {
                // Return Bearer only
                sendResponse({
                  success: true,
                  bearer: tokens.bearer,
                  recaptcha: null,
                  warning:
                    "Failed to get fresh reCAPTCHA: " +
                    (chrome.runtime.lastError?.message || response?.error),
                });
                return;
              }

              // Store fresh reCAPTCHA
              tokens.recaptcha = response.token;
              tokens.timestamp = Date.now();

              // Use URL projectId if not captured from requests
              const finalProjectId = tokens.projectId || urlProjectId;
              if (urlProjectId && !tokens.projectId) {
                tokens.projectId = urlProjectId;
              }

              chrome.storage.local.set({ latestTokens: tokens }); // //
              sendResponse({
                success: true,
                bearer: tokens.bearer,
                recaptcha: response.token,
                sessionId: tokens.sessionId,
                projectId: finalProjectId,
              });
            },
          );
        });
      });

      return true;
    }

    // === v3.0: Queue video request for interception ===
    if (request.action === "queueVideoRequest") {
      //

      // Find labs.google tab
      chrome.tabs.query({ url: "https://labs.google/*" }, (tabs) => {
        if (tabs.length === 0) {
          sendResponse({
            success: false,
            error: "No labs.google tab found! Open labs.google/fx first.",
          });
          return;
        }

        const labsTab = tabs[0];

        // Forward to content script
        chrome.tabs.sendMessage(
          labsTab.id,
          {
            action: "queueVideoRequest",
            prompt: request.prompt,
            aspectRatio: request.aspectRatio,
            duration: request.duration,
          },
          (response) => {
            if (chrome.runtime.lastError) {
              sendResponse({
                success: false,
                error: chrome.runtime.lastError.message,
              });
              return;
            }
            sendResponse(response);
          },
        );
      });

      return true; // async response
    }

    // === NEW: Get fresh reCAPTCHA token from labs.google ===
    if (request.action === "getFreshRecaptchaToken") {
      //

      // Find labs.google tab
      chrome.tabs.query({ url: "https://labs.google/*" }, (tabs) => {
        if (tabs.length === 0) {
          sendResponse({
            success: false,
            error: "No labs.google tab found! Open labs.google/fx first.",
          });
          return;
        }

        const labsTab = tabs[0]; //

        // Send message to labs_content.js
        chrome.tabs.sendMessage(
          labsTab.id,
          {
            action: "generateRecaptchaToken",
            actionName: request.actionName || "flow",
          },
          (response) => {
            if (chrome.runtime.lastError) {
              console.error("🔐 Error:", chrome.runtime.lastError);
              sendResponse({
                success: false,
                error: chrome.runtime.lastError.message,
              });
              return;
            }

            if (response && response.success) {
              //
              // Store the fresh token
              latestTokens.recaptcha = response.token;
              latestTokens.timestamp = Date.now();
              chrome.storage.local.set({ latestTokens });

              sendResponse({ success: true, token: response.token });
            } else {
              sendResponse({
                success: false,
                error: response?.error || "Unknown error",
              });
            }
          },
        );
      });

      return true; // async response
    }

    // === NEW v2.4: Make API call from labs.google page context ===
    if (request.action === "proxyApiCall") {
      //

      // Find labs.google tab
      chrome.tabs.query({ url: "https://labs.google/*" }, (tabs) => {
        if (tabs.length === 0) {
          sendResponse({
            success: false,
            error: "No labs.google tab found! Open labs.google/fx first.",
          });
          return;
        }

        const labsTab = tabs[0]; //

        // Send to labs_content.js which will forward to page script
        chrome.tabs.sendMessage(
          labsTab.id,
          {
            action: "proxyApiCall",
            url: request.url,
            payload: request.payload,
            bearerToken: request.bearerToken,
          },
          (response) => {
            if (chrome.runtime.lastError) {
              console.error("🔐 Error:", chrome.runtime.lastError);
              sendResponse({
                success: false,
                error: chrome.runtime.lastError.message,
              });
              return;
            } //
            sendResponse(response);
          },
        );
      });

      return true; // async response
    }

    if (request.action === "proxyRequest") {
      const { url, payload, bearerToken, recaptchaToken } = request; //

      // Make the actual API call from extension context (no CORS!)
      fetch(url, {
        method: "POST",
        credentials: "include", // Include cookies for labs.google session
        headers: {
          "Content-Type": "text/plain;charset=UTF-8",
          Authorization: bearerToken.startsWith("Bearer ")
            ? bearerToken
            : `Bearer ${bearerToken}`,
          Origin: "https://labs.google",
          Referer: "https://labs.google/",
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/143.0.0.0 Safari/537.36",
          "sec-ch-ua":
            '"Google Chrome";v="143", "Chromium";v="143", "Not A(Brand";v="24"',
          "sec-ch-ua-mobile": "?0",
          "sec-ch-ua-platform": '"Windows"',
          DNT: "1",
        },
        body: JSON.stringify(payload),
      })
        .then(async (response) => {
          const data = await response.json(); //

          // Log detailed error for non-OK responses
          if (!response.ok) {
            //
          }

          sendResponse({
            ok: response.ok,
            status: response.status,
            data: data,
          });
        })
        .catch((error) => {
          console.error("🌐 Extension proxy: Error", error);
          sendResponse({
            ok: false,
            status: 0,
            error: error.message,
          });
        });

      return true; // async response
    }
  },
);
