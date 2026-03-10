export async function requestMotionPermission(): Promise<boolean> {
  try {
    await wx.startDeviceMotionListening({ interval: 'game' })
    return true
  } catch {
    return false
  }
}