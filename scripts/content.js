// Fetch remot and local resources
const JSON_MIME_TYPES = ['application/activity+json', 'application/json']
async function fetchRemote(url, token) {
  let { data, error } = await chrome.runtime.sendMessage({
    action: 'fetch',
    url,
    token,
  })
  if (error) {
    throw error
  }
  return data
}
async function fetchRemoteHead(url, token) {
  let { data, error } = await chrome.runtime.sendMessage({
    action: 'fetch-head',
    url,
    token,
  })
  if (error) {
    throw error
  }
  return data
}
function isHeadValid({ status, contentType }) {
  return (
    // Correct JSON response
    (
      status >= 200
      && status < 300
      && JSON_MIME_TYPES.some(type => contentType.includes(type))
    )
    // Method HEAD not supported
    || status === 405
  )
}
async function fetchLocal(url, token) {
  let res = await fetch(url, {
    method: 'get',
    headers: {
      accept: JSON_MIME_TYPES.join(', '),
      authorization: token ? ('bearer ' + token) : null,
    },
  })
  let data = await res.json()
  if (res.status >= 200 && res.status < 300) {
    return data
  }
  else {
    throw data
  }
}

// Get stored Mastodon handle and validate it
async function getHandle() {
  let { handle } = await chrome.storage.local.get('handle')
  if (!handle || !/^@[^@\s]+@[^@\s]+$/.test(handle)) {
    throw new Error('Invalid handle format')
  }
  let [user, domain] = handle.slice(1).split('@')
  return { handle, user, domain }
}

// Load access token for API calls
let token
function loadToken() {
  if (token) {
    return token
  }
  token = (
    JSON.parse(document.getElementById('initial-state').textContent)
    .meta
    .access_token
  )
  return token
}
async function apiCall(path) {
  return fetchLocal('/api/v2/' + path, token)
}

// Load subscribe URL from WebFinger
let getLocalLink = () => ''
async function loadWebFinger(handle) {
  let webfinger = await fetchLocal(
    '/.well-known/webfinger?resource=acct:' + handle.slice(1)
  )
  let subscribe = (
    webfinger.links
    .find(item => item.rel === 'http://ostatus.org/schema/1.0/subscribe')
    .template
  )
  getLocalLink = (uri) => subscribe.replace('{uri}', encodeURIComponent(uri))
}

// Import CSS directly to the webpage
function importStyles() {
  // Get colors based on selected instance and theme
  let tmp = document.createElement('div')
  document.body.appendChild(tmp)
  tmp.className = 'status'
  let borderColor = window.getComputedStyle(tmp).borderBottomColor
  tmp.className = 'status status-direct'
  let alternativeBorderColor = window.getComputedStyle(tmp).borderBottomColor
  tmp.className = 'status__content__read-more-button'
  let linkColor = window.getComputedStyle(tmp).color
  document.body.removeChild(tmp)

  // Inject style
  let css = `
    a[data-mastodon-plus-toot="true"] {
      display: block;
      border: 1px solid ${borderColor};
      border-radius: 4px;
      padding: 8px;
      margin: 8px 0;
      font-weight: bold;
      color: ${linkColor} !important;
    }
    .status-direct a[data-mastodon-plus-toot="true"] {
      border-color: ${alternativeBorderColor};
    }
    a[data-mastodon-plus-toot="true"]:hover {
      border-color: ${linkColor} !important;
      text-decoration: none;
    }
    a[data-mastodon-plus-toot="true"]::before {
      content: '📜 ';
    }
    a[data-mastodon-plus-toot="true"]::after {
      content: ': ' attr(data-mastodon-plus-content);
      font-weight: normal;
    }
  `
  let style = document.createElement('style')
  style.appendChild(document.createTextNode(css))
  document.head.appendChild(style)
}


// Replace links to toots with "quote toots"
function replaceLinks() {
  let links = document.querySelectorAll(
    '.status__content__text'
    + ' '
    + 'a.status-link.unhandled-link'
    + '[target="_blank"]'
    + ':not([data-mastodon-plus-checked="true"])'
  )

  for (let link of links) {
    link.dataset.mastodonPlusChecked = 'true'
    ;(async () => {
      // Check if the node supports the ActivityPub protocol
      let url = new URL(link.href)
      let nodeInfoSchemaHead = await fetchRemoteHead(url.origin + '/.well-known/nodeinfo')
      if (!isHeadValid(nodeInfoSchemaHead)) {
        return
      }
      let nodeInfoSchema = await fetchRemote(url.origin + '/.well-known/nodeinfo')
      let nodeInfo = await fetchRemote(nodeInfoSchema.links[0].href)
      if (!nodeInfo.protocols.includes('activitypub')) {
        return
      }

      // Check if the URL contains a valid ActivityPub post
      let head = await fetchRemoteHead(link.href)
      if (!isHeadValid(head)) {
        return
      }
      let data = await fetchRemote(link.href)
      if (
        !data['@context'].includes('https://www.w3.org/ns/activitystreams')
        || !['Note', 'Question'].includes(data.type)
      ) {
        return
      }

      // Update attributes and replace href with local toot URL
      link.dataset.mastodonPlusToot = 'true'
      link.target = '_self'
      link.href = getLocalLink(data.url || link.href)

      // Add toot content
      let content = ''
      if (data.sensitive) {
        content = '⚠️ ' + (data.summary || '')
      }
      else {
        let wrapper = document.createElement('div')
        wrapper.innerHTML = (
          data.content
          .replace(/<\/p>/gi, ' </p>')
          .replace(/<br(?=[\/ >])/gi, ' <br')
        )
        content = wrapper.textContent.replace(/\s+/g, ' ')
      }
      if (data.attachment && data.attachment.length > 0) {
        content += ' 🖼️'
      }
      else if (data.oneOf && data.oneOf.length > 0) {
        content += ' 📊'
      }
      link.dataset.mastodonPlusContent = content
    })().catch(err => {})
  }
}

// Main function
async function main() {
  let { handle, user, domain } = await getHandle()

  if (window.location.host !== domain) {
    return
  }

  loadToken()

  await loadWebFinger(handle)

  importStyles()

  let observer = new MutationObserver(replaceLinks)
  observer.observe(document.body, { subtree: true, childList: true })
  replaceLinks()
}

main().catch(err => console.error('[Mastodon Plus]', err))
