'use strict'

const REMINDER_SUBSCRIBE_MESSAGE_CONFIG = Object.freeze({
  templateId: 'HpURo3YBuk3eHxHaYTzViDKnGXaX3Q6WQbTxVlvGugg',
  miniprogramState: 'trial',
  keywordMap: Object.freeze({
    title: 'thing2',
    time: 'date4',
    subtitle: 'thing10',
  }),
})
const FALLBACK_TIMEZONE_OFFSET_MS = 8 * 60 * 60 * 1000

function trimOptionalString(value) {
  if (typeof value !== 'string') {
    return undefined
  }

  const trimmedValue = value.trim()
  return trimmedValue.length > 0 ? trimmedValue : undefined
}

function formatReminderTime(timestampMs) {
  if (typeof timestampMs !== 'number' || !Number.isFinite(timestampMs)) {
    return ''
  }

  const date = new Date(timestampMs + FALLBACK_TIMEZONE_OFFSET_MS)
  const year = date.getUTCFullYear()
  const month = `${date.getUTCMonth() + 1}`.padStart(2, '0')
  const day = `${date.getUTCDate()}`.padStart(2, '0')
  const hours = `${date.getUTCHours()}`.padStart(2, '0')
  const minutes = `${date.getUTCMinutes()}`.padStart(2, '0')

  return `${year}年${month}月${day}日 ${hours}:${minutes}`
}

function clampThingValue(value, maxLength = 15) {
  const normalizedValue = trimOptionalString(value) || ''
  if (normalizedValue.length <= maxLength) {
    return normalizedValue
  }

  return `${normalizedValue.slice(0, maxLength)}...`
}

function buildReminderMessageData(reminderJob) {
  const keywordMap = REMINDER_SUBSCRIBE_MESSAGE_CONFIG.keywordMap
  const data = {}

  const locationTitle = clampThingValue(reminderJob.locationTitle || '位置提醒')
  const locationSubtitle =
    clampThingValue(
      reminderJob.locationSubtitle ||
        reminderJob.sceneType ||
        '打开查看详情'
    )
  const reminderTime =
    trimOptionalString(reminderJob.reminderDisplayText) ||
    formatReminderTime(reminderJob.reminderAt)

  if (trimOptionalString(keywordMap.title)) {
    data[keywordMap.title] = {
      value: locationTitle,
    }
  }

  if (trimOptionalString(keywordMap.time)) {
    data[keywordMap.time] = {
      value: reminderTime,
    }
  }

  if (trimOptionalString(keywordMap.subtitle)) {
    data[keywordMap.subtitle] = {
      value: locationSubtitle,
    }
  }

  return data
}

function isReminderSubscribeMessageConfigured() {
  return Boolean(
    trimOptionalString(REMINDER_SUBSCRIBE_MESSAGE_CONFIG.templateId) &&
      trimOptionalString(REMINDER_SUBSCRIBE_MESSAGE_CONFIG.miniprogramState) &&
      trimOptionalString(REMINDER_SUBSCRIBE_MESSAGE_CONFIG.keywordMap.title) &&
      trimOptionalString(REMINDER_SUBSCRIBE_MESSAGE_CONFIG.keywordMap.time)
  )
}

module.exports = {
  REMINDER_SUBSCRIBE_MESSAGE_CONFIG,
  buildReminderMessageData,
  isReminderSubscribeMessageConfigured,
}
