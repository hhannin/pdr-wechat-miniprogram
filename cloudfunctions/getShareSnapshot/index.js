'use strict'

const cloud = require('wx-server-sdk')

const SHARE_COLLECTION_NAME = 'share_snapshots'

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

exports.main = async (event) => {
  const shareId = typeof event.shareId === 'string' ? event.shareId.trim() : ''
  if (!shareId) {
    return {
      status: 'expired',
    }
  }

  const db = cloud.database()
  const queryResult = await db
    .collection(SHARE_COLLECTION_NAME)
    .where({
      shareId,
    })
    .limit(1)
    .get()
  const snapshot = Array.isArray(queryResult.data) ? queryResult.data[0] : undefined

  if (!snapshot) {
    return {
      status: 'expired',
    }
  }

  if (typeof snapshot.expiresAt !== 'number' || snapshot.expiresAt <= Date.now()) {
    return {
      status: 'expired',
    }
  }

  return {
    status: 'ready',
    snapshot: {
      shareId: snapshot.shareId,
      sourceItemId: snapshot.sourceItemId,
      expiresAt: snapshot.expiresAt,
      createdAt: snapshot.createdAt,
      updatedAt: snapshot.updatedAt,
      sceneType: snapshot.sceneType,
      location: snapshot.location,
      anchorValues: snapshot.anchorValues || {},
      note: typeof snapshot.note === 'string' ? snapshot.note : '',
      reminderAt: typeof snapshot.reminderAt === 'number' ? snapshot.reminderAt : undefined,
      hasImage: Boolean(snapshot.hasImage),
      remotePhotos: Array.isArray(snapshot.remotePhotos) ? snapshot.remotePhotos : [],
      shareCardTitle: typeof snapshot.shareCardTitle === 'string' ? snapshot.shareCardTitle : '',
      shareCardSubtitle:
        typeof snapshot.shareCardSubtitle === 'string' ? snapshot.shareCardSubtitle : '',
    },
  }
}
