let handleInput = document.getElementById('handle')

let { handle } = await chrome.storage.local.get('handle')
if (handle) {
  handleInput.value = handle
}

handleInput.onchange = async () => {
  await chrome.storage.local.set({ handle: handleInput.value.trim() })
}
