'use strict'

const cloud = require('wx-server-sdk')

const REMINDER_JOB_COLLECTION_NAME = 'reminder_jobs'

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

function trimOptionalString(value) {
  if (typeof value !== 'string') {
    return undefined
  }

  const trimmedValue = value.trim()
  return trimmedValue.length > 0 ? trimmedValue : undefined
}

function normalizeReminderTimestamp(value) {
  if (value === undefined || value === null) {
    return undefined
  }

  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error('提醒时间无效。')
  }

  return Math.floor(value)
}

function buildReminderJobId(ownerOpenId, itemId) {
  return `${ownerOpenId}__${itemId}`
}

function buildReminderPagePath(itemId) {
  return `pages/post-view/index?itemId=${encodeURIComponent(itemId)}&source=reminder`
}

async function getExistingReminderJob(collection, jobId) {
  try {
    const result = await collection.doc(jobId).get()
    return result && result.data ? result.data : null
  } catch (error) {
    const errorMessage =
      typeof error?.errMsg === 'string'
        ? error.errMsg
        : typeof error?.message === 'string'
          ? error.message
          : ''

    if (/document\.get:fail|document does not exist|docId not exist/i.test(errorMessage)) {
      return null
    }

    throw error
  }
}

exports.main = async (event) => {
  const { OPENID } = cloud.getWXContext()
  if (!trimOptionalString(OPENID)) {
    throw new Error('当前无法识别用户身份。')
  }

  const itemId = trimOptionalString(event.itemId)
  if (!itemId) {
    throw new Error('itemId is required.')
  }

  const reminderSyncState = event.reminderSyncState === 'scheduled' ? 'scheduled' : 'unscheduled'
  const reminderAt = normalizeReminderTimestamp(event.reminderAt)
  const db = cloud.database()
  const collection = db.collection(REMINDER_JOB_COLLECTION_NAME)
  const now = Date.now()
  const jobId = buildReminderJobId(OPENID, itemId)
  const existingJob = await getExistingReminderJob(collection, jobId)

  if (
    reminderSyncState !== 'scheduled' ||
    typeof reminderAt !== 'number' ||
    reminderAt <= now
  ) {
    if (!existingJob) {
      return {
        status: 'noop',
      }
    }

    await collection.doc(jobId).set({
      data: {
        ownerOpenId: OPENID,
        itemId,
        reminderAt:
          typeof existingJob.reminderAt === 'number' ? existingJob.reminderAt : undefined,
        status: 'cancelled',
        sceneType: trimOptionalString(existingJob.sceneType) || 'default',
        locationTitle: trimOptionalString(existingJob.locationTitle) || '位置提醒',
        locationSubtitle: trimOptionalString(existingJob.locationSubtitle) || '',
        reminderDisplayText:
          trimOptionalString(existingJob.reminderDisplayText) || '',
        pagePath:
          trimOptionalString(existingJob.pagePath) || buildReminderPagePath(itemId),
        updatedAt: now,
        cancelledAt: now,
        sentAt:
          typeof existingJob.sentAt === 'number' ? existingJob.sentAt : null,
        failedAt:
          typeof existingJob.failedAt === 'number' ? existingJob.failedAt : null,
        lastError: trimOptionalString(existingJob.lastError) || '',
        createdAt:
          typeof existingJob.createdAt === 'number'
            ? existingJob.createdAt
            : now,
      },
    })

    return {
      status: 'cancelled',
    }
  }

  const sceneType = trimOptionalString(event.sceneType) || 'default'
  const locationTitle = trimOptionalString(event.locationTitle) || '位置提醒'
  const locationSubtitle = trimOptionalString(event.locationSubtitle) || ''
  const reminderDisplayText = trimOptionalString(event.reminderDisplayText) || ''

  await collection.doc(jobId).set({
    data: {
      ownerOpenId: OPENID,
      itemId,
      reminderAt,
      status: 'scheduled',
      sceneType,
      locationTitle,
      locationSubtitle,
      reminderDisplayText,
      pagePath: buildReminderPagePath(itemId),
      createdAt:
        existingJob && typeof existingJob.createdAt === 'number'
          ? existingJob.createdAt
          : now,
      updatedAt: now,
      cancelledAt: null,
      sentAt: null,
      failedAt: null,
      lastError: '',
    },
  })

  return {
    status: 'scheduled',
  }
}
