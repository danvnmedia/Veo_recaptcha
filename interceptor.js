// Fetch Interceptor for labs.google v5.23 - runs in PAGE context
// SAFE MODE: Only modify prompt text, don't change aspectRatio/model (causes 400 errors)
// Settings need to be changed via Flow UI, not request body modification
// NEW: reCAPTCHA Enterprise token generation support

(function () {
  //

  // ===== reCAPTCHA ENTERPRISE TOKEN GENERATION =====
  // Site key from labs.google (found via document.scripts search)
  const RECAPTCHA_SITE_KEY = "6LdsFiUsAAAAAIjVDZcuLhaHiDn5nnHVXVRQGeMV";

  // Get fresh reCAPTCHA Enterprise token for video/image generation
  async function getReCaptchaToken(action = "FLOW_GENERATION") {
    try {
      // Check if grecaptcha.enterprise is loaded
      if (typeof grecaptcha === "undefined" || !grecaptcha.enterprise) {
        console.warn("🔐 grecaptcha.enterprise not loaded, waiting...");

        // Wait for it to load (max 5 seconds)
        for (let i = 0; i < 50; i++) {
          if (typeof grecaptcha !== "undefined" && grecaptcha.enterprise) {
            break;
          }
          await new Promise((r) => setTimeout(r, 100));
        }

        if (typeof grecaptcha === "undefined" || !grecaptcha.enterprise) {
          console.error("🔐 grecaptcha.enterprise failed to load");
          return null;
        }
      } //

      // Execute reCAPTCHA Enterprise challenge
      const token = await grecaptcha.enterprise.execute(RECAPTCHA_SITE_KEY, {
        action: action,
      }); //
      return token;
    } catch (error) {
      console.error("🔐 reCAPTCHA token error:", error);
      return null;
    }
  }

  // Available actions:
  // - 'FLOW_GENERATION' - Default for video/image generation
  // - 'signin' - For sign in
  // - Others as needed

  // CRITICAL: Save original fetch BEFORE any interception for use in proxyApiCall
  const originalFetch = window.fetch;

  // Listen for token requests from content script
  window.addEventListener("message", async (event) => {
    if (event.source !== window) return;

    if (event.data?.type === "veo_requestRecaptchaToken") {
      const action = event.data.action || "FLOW_GENERATION";
      const token = await getReCaptchaToken(action);

      window.postMessage(
        {
          type: "veo_recaptchaToken",
          token: token,
          action: action,
          success: !!token,
        },
        "*",
      );
    }

    // === NEW: Proxy API call with fresh reCAPTCHA ===
    if (event.data?.type === "veo_proxyApiCall") {
      const requestId = event.data.requestId; // Capture for matching responses//

      try {
        // Get fresh reCAPTCHA token
        const freshToken = await getReCaptchaToken("FLOW_GENERATION"); //

        // Update payload with fresh reCAPTCHA token AND fresh sessionId
        // Use NEW format: recaptchaContext.token (not old recaptchaToken)
        const payload = event.data.payload;
        if (payload.clientContext) {
          // NEW FORMAT: recaptchaContext object with token and applicationType
          payload.clientContext.recaptchaContext = {
            token: freshToken,
            applicationType: "RECAPTCHA_APPLICATION_TYPE_WEB",
          };
          // Remove old format if present
          delete payload.clientContext.recaptchaToken;
          // Generate fresh sessionId like Flow does (not use stored stale one!)
          payload.clientContext.sessionId = `;${Date.now()}`;
        }
        if (payload.requests && payload.requests[0]?.clientContext) {
          // NEW FORMAT for nested requests too
          payload.requests[0].clientContext.recaptchaContext = {
            token: freshToken,
            applicationType: "RECAPTCHA_APPLICATION_TYPE_WEB",
          };
          // Remove old format if present
          delete payload.requests[0].clientContext.recaptchaToken;
        }

        // DEBUG: Log payload structure//

        // DEBUG: Log full payload for debugging (increased to 3000)//

        // Make API call from page context - USE originalFetch to bypass our own interceptor!
        const bearerToken = event.data.bearerToken;
        const urlStr = event.data.url;

        // Use text/plain as per labs.google cURL (NOT application/json!)//

        // CRITICAL: Use originalFetch to bypass our own fetch interceptor!
        const response = await originalFetch(urlStr, {
          method: "POST",
          mode: "cors",
          credentials: "include",
          headers: {
            "Content-Type": "text/plain;charset=UTF-8",
            Authorization: bearerToken.startsWith("Bearer ")
              ? bearerToken
              : "Bearer " + bearerToken,
            Accept: "*/*",
            "Cache-Control": "no-cache",
            Pragma: "no-cache",
          },
          body: JSON.stringify(payload),
        });

        const data = await response.json(); //

        // DEBUG: Log error details if failed
        if (!response.ok) {
          //
        }

        window.postMessage(
          {
            type: "veo_apiCallResult",
            requestId: requestId,
            success: true,
            ok: response.ok,
            status: response.status,
            data: data,
          },
          "*",
        );
      } catch (error) {
        console.error("?? [PAGE] API call error:", error);
        window.postMessage(
          {
            type: "veo_apiCallResult",
            requestId: requestId,
            success: false,
            error: error.message,
          },
          "*",
        );
      }
    }
  });

  // originalFetch is now defined at line 53, before the message handler

  function getPendingRequest() {
    return new Promise((resolve) => {
      const handler = (event) => {
        if (event.data?.type === "flowHarvester_pendingInfo") {
          window.removeEventListener("message", handler);
          resolve(event.data);
        }
      };
      window.addEventListener("message", handler);
      window.postMessage({ type: "flowHarvester_getPending" }, "*");

      setTimeout(() => {
        window.removeEventListener("message", handler);
        resolve({ video: null, image: null });
      }, 200);
    });
  }

  // SAFE: Only modify the prompt text, preserve original aspectRatio/model
  function applyPromptOnly(parsedBody, prompt) {
    if (!parsedBody.requests || !parsedBody.requests[0]) {
      //
      return false;
    }

    const request = parsedBody.requests[0];

    // Only modify the prompt
    if (request.textInput && prompt) {
      const oldPrompt = request.textInput.prompt;
      request.textInput.prompt = prompt; //

      // Log what settings Flow is using (but don't change them)// //

      return true;
    }

    return false;
  }

  window.fetch = async function (...args) {
    const [url, options] = args;
    const urlStr = typeof url === "string" ? url : url.toString();

    // VIDEO GENERATION REQUEST
    if (
      urlStr.includes("video:batchAsync") ||
      urlStr.includes("batchAsyncGenerateVideoText") ||
      urlStr.includes("GenerateVideo")
    ) {
      //

      try {
        const pending = await getPendingRequest();

        if (pending.video && pending.video.prompt) {
          //

          let body = options?.body;
          let parsedBody;

          if (typeof body === "string") {
            parsedBody = JSON.parse(body);
          } else {
            //
            return originalFetch.apply(window, args);
          }

          // Only modify prompt, keep everything else as-is
          const modified = applyPromptOnly(parsedBody, pending.video.prompt);

          if (modified) {
            //

            const newOptions = {
              ...options,
              body: JSON.stringify(parsedBody),
            };

            window.postMessage(
              { type: "flowHarvester_modificationApplied" },
              "*",
            );

            const response = await originalFetch.call(window, url, newOptions);

            // Handle response
            const clonedResponse = response.clone();
            try {
              const data = await clonedResponse.json();

              window.postMessage(
                {
                  type: "flowHarvester_videoResponse",
                  success: response.ok,
                  status: response.status,
                  data: data,
                  error: response.ok
                    ? null
                    : data.error?.message || `HTTP ${response.status}`,
                },
                "*",
              );
            } catch (e) {
              window.postMessage(
                {
                  type: "flowHarvester_videoResponse",
                  success: response.ok,
                  status: response.status,
                  error: response.ok ? null : "Failed to parse response",
                },
                "*",
              );
            }

            return response;
          }
        } else {
          //
        }
      } catch (error) {
        console.error("🎯 Error in interceptor:", error);
      }
    }

    return originalFetch.apply(window, args);
  }; //

  // Expose functions globally
  window.__veoInterceptor = {
    getPending: getPendingRequest,
    getReCaptchaToken: getReCaptchaToken,
  };
})();
