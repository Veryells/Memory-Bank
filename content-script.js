(async () => {
  try {
    await import(chrome.runtime.getURL("dist/presentation/content/content-entry.js"));
  } catch (error) {
    console.error("MemoryBank content loader failed", error);
  }
})();
