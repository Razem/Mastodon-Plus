chrome.runtime.onInstalled.addListener(() => {
})

const JSON_MIME_TYPES = ['application/activity+json', 'application/json']

chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  // Handle external cross-origin resource fetching
  if (message.action === 'fetch') {
    (async () => {
      try {
        let res = await fetch(message.url, {
          method: 'get',
          headers: {
            accept: JSON_MIME_TYPES.join(', '),
            authorization: message.token ? ('bearer ' + message.token) : null,
          },
        })
        let data = await res.json()
        if (res.status >= 200 && res.status < 300) {
          sendResponse({ data })
        }
        else {
          throw data
        }
      }
      catch (error) {
        sendResponse({ error })
      }
    })()
    return true
  }
  else if (message.action === 'fetch-head') {
    (async () => {
      try {
        let res = await fetch(message.url, {
          method: 'head',
          headers: {
            accept: message.json ? JSON_MIME_TYPES.join(', ') : null,
            authorization: message.token ? ('bearer ' + message.token) : null,
          },
        })
        sendResponse({
          data: {
            url: res.url,
            status: res.status || 405,
            contentType: res.headers.get('content-type') || '',
          },
        })
      }
      catch (error) {
        sendResponse({ error })
      }
    })()
    return true
  }
})
