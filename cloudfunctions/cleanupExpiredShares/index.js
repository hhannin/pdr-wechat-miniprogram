'use strict'

const cloud = require('wx-server-sdk')

const SHARE_COLLECTION_NAME = 'share_snapshots'

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

async function deleteRemotePhotos(remotePhotos) {
  const fileList = Array.isArray(remotePhotos)
    ? remotePhotos
        .map((remotePhoto) =>
          remotePhoto && typeof remotePhoto.fileId === 'string'
            ? remotePhoto.fileId.trim()
            : ''
        )
        .filter((fileId) => fileId.length > 0)
    : []

  if (fileList.length === 0) {
    return
  }

  await cloud.deleteFile({
    fileList,
  })
}

exports.main = async () => {
  const db = cloud.database()
  const _ = db.command
  const now = Date.now()
  let deletedCount = 0

  while (true) {
    const queryResult = await db
      .collection(SHARE_COLLECTION_NAME)
      .where({
        expiresAt: _.lte(now),
      })
      .limit(100)
      .get()

    if (!Array.isArray(queryResult.data) || queryResult.data.length === 0) {
      break
    }

    for (const snapshot of queryResult.data) {
      await deleteRemotePhotos(snapshot.remotePhotos)
      await db.collection(SHARE_COLLECTION_NAME).doc(snapshot.shareId).remove()
      deletedCount += 1
    }
  }

  return {
    deletedCount,
  }
}
