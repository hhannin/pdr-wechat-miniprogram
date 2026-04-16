'use strict'

const cloud = require('wx-server-sdk')
const {
  REMINDER_SUBSCRIBE_MESSAGE_CONFIG,
  buildReminderMessageData,
  isReminderSubscribeMessageConfigured,
} = require('./reminder-config')

const REMINDER_JOB_COLLECTION_NAME = 'reminder_jobs'
const QUERY_BATCH_LIMIT = 100

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

function buildFailureMessage(error) {
  if (typeof error?.errMsg === 'string' && error.errMsg.trim().length > 0) {
    return error.errMsg.trim()
  }

  if (typeof error?.message === 'string' && error.message.trim().length > 0) {
    return error.message.trim()
  }

  return 'unknown_error'
}

async function markReminderJob(collection, jobId, patch) {
  await collection.doc(jobId).update({
    data: patch,
  })
}

exports.main = async () => {
  const db = cloud.database()
  const _ = db.command
  const collection = db.collection(REMINDER_JOB_COLLECTION_NAME)
  const now = Date.now()
  let sentCount = 0
  let failedCount = 0

  while (true) {
    const queryResult = await collection
      .where({
        status: 'scheduled',
        reminderAt: _.lte(now),
      })
      .limit(QUERY_BATCH_LIMIT)
      .get()

    if (!Array.isArray(queryResult.data) || queryResult.data.length === 0) {
      break
    }

    for (const reminderJob of queryResult.data) {
      const jobId =
        trimOptionalString(reminderJob._id) ||
        trimOptionalString(reminderJob.itemId)

      if (!jobId) {
        failedCount += 1
        continue
      }

      if (!isReminderSubscribeMessageConfigured()) {
        await markReminderJob(collection, jobId, {
          status: 'failed',
          updatedAt: Date.now(),
          failedAt: Date.now(),
          lastError: 'missing_template_config',
        })
        failedCount += 1
        continue
      }

      try {
        await cloud.openapi.subscribeMessage.send({
          touser: reminderJob.ownerOpenId,
          templateId: REMINDER_SUBSCRIBE_MESSAGE_CONFIG.templateId,
          page: trimOptionalString(reminderJob.pagePath) || 'pages/records/index',
          miniprogramState:
            trimOptionalString(REMINDER_SUBSCRIBE_MESSAGE_CONFIG.miniprogramState) ||
            'formal',
          lang: 'zh_CN',
          data: buildReminderMessageData(reminderJob),
        })

        await markReminderJob(collection, jobId, {
          status: 'sent',
          updatedAt: Date.now(),
          sentAt: Date.now(),
          lastError: '',
        })
        sentCount += 1
      } catch (error) {
        console.error('[dispatchDueReminders] send failed', {
          jobId,
          itemId: reminderJob.itemId,
          error: buildFailureMessage(error),
        })
        await markReminderJob(collection, jobId, {
          status: 'failed',
          updatedAt: Date.now(),
          failedAt: Date.now(),
          lastError: buildFailureMessage(error),
        })
        failedCount += 1
      }
    }
  }

  return {
    sentCount,
    failedCount,
  }
}
