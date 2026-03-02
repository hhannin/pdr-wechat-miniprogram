App<IAppOption>({
  globalData: {
    sensorRunning: false
  },
  onLaunch() {
    console.log('PDR App Launched')
  },
  onHide() {
    console.log('App Hidden')
  }
})