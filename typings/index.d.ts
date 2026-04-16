/// <reference path="./types/index.d.ts" />

interface IAppOption {
  globalData: {
    sensorRunning: boolean,
  }
  userInfoReadyCallback?: WechatMiniprogram.GetUserInfoSuccessCallback,
}