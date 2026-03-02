export async function requestMotionPermission(): Promise<boolean> {
  try {
    await wx.startDeviceMotionListening()
    return true
  } catch {
    return false
  }
}