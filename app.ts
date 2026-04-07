import { appRuntime } from './pages/common/runtime'

function tryInitializeCloud(): void {
  if (!wx.cloud) {
    return
  }

  wx.cloud.init({
    env: 'DYNAMIC_CURRENT_ENV',
    traceUser: true,
  })
}

function clearExpiredSharedSnapshots(): void {
  void appRuntime.clearExpiredSharedSnapshots().catch(() => {
    // Best effort cleanup so startup is never blocked by local cache maintenance.
  })
}

App<IAppOption>({
  globalData: {
    sensorRunning: false,
  },

  onLaunch() {
    tryInitializeCloud()
    clearExpiredSharedSnapshots()
  },

  onShow() {
    clearExpiredSharedSnapshots()
  },
})
