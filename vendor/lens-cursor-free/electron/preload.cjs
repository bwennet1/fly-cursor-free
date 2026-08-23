const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('cursorFree', {
  getBuildFlags: () => ipcRenderer.invoke('app:get-build-flags'),
  validateLicense: (licenseKey) => ipcRenderer.invoke('hub:validate', licenseKey),
  checkLicenseStatus: () => ipcRenderer.invoke('hub:license-status'),
  getSession: () => ipcRenderer.invoke('hub:get-session'),
  clearSession: () => ipcRenderer.invoke('hub:clear-session'),
  getVersionInfo: () => ipcRenderer.invoke('hub:get-version-info'),
  openExternal: (url) => ipcRenderer.invoke('shell:open-external', url),
  switchAccount: () => ipcRenderer.invoke('hub:switch-account'),
  onSwitchPhase: (callback) => {
    if (typeof callback !== 'function') return () => {};
    const handler = (_event, message) => callback(message);
    ipcRenderer.on('switch:phase', handler);
    return () => ipcRenderer.removeListener('switch:phase', handler);
  },
  retryConsumePeriodSwitch: () => ipcRenderer.invoke('hub:retry-consume-period-switch'),
  importDefaults: () => ipcRenderer.invoke('import:defaults'),
  importCaptureLive: (opts) => ipcRenderer.invoke('import:capture-live', opts),
  importUpload: (payload) => ipcRenderer.invoke('import:upload', payload),
  importSaveBundle: () => ipcRenderer.invoke('import:save-bundle'),
  importLoadBundle: () => ipcRenderer.invoke('import:load-bundle'),
});
