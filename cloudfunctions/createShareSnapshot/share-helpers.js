'use strict'

const SHARE_EXPIRATION_DURATION_MS = 24 * 60 * 60 * 1000

function trimOptionalString(value) {
  if (typeof value !== 'string') {
    return undefined
  }

  const trimmedValue = value.trim()
  return trimmedValue.length > 0 ? trimmedValue : undefined
}

function normalizeTimestamp(value, label) {
  if (typeof value !== 'number' || !Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive timestamp.`)
  }

  return Math.floor(value)
}

function normalizeOptionalTimestamp(value, label) {
  if (value === undefined || value === null) {
    return undefined
  }

  return normalizeTimestamp(value, label)
}

function normalizeRemotePhoto(remotePhoto) {
  if (!remotePhoto || typeof remotePhoto !== 'object') {
    throw new Error('remotePhotos contains an invalid item.')
  }

  const fileId = trimOptionalString(remotePhoto.fileId)
  const fileName = trimOptionalString(remotePhoto.fileName)
  const mimeType = trimOptionalString(remotePhoto.mimeType)

  if (!fileId || !fileName || !mimeType) {
    throw new Error('remotePhotos metadata is incomplete.')
  }

  return Object.freeze({
    fileId,
    fileName,
    mimeType,
    byteLength:
      typeof remotePhoto.byteLength === 'number' && Number.isFinite(remotePhoto.byteLength)
        ? Math.max(0, Math.floor(remotePhoto.byteLength))
        : undefined,
    width:
      typeof remotePhoto.width === 'number' && Number.isFinite(remotePhoto.width)
        ? Math.max(0, Math.floor(remotePhoto.width))
        : undefined,
    height:
      typeof remotePhoto.height === 'number' && Number.isFinite(remotePhoto.height)
        ? Math.max(0, Math.floor(remotePhoto.height))
        : undefined,
  })
}

function normalizeRemotePhotos(remotePhotos) {
  if (!Array.isArray(remotePhotos) || remotePhotos.length === 0) {
    return Object.freeze([])
  }

  return Object.freeze(remotePhotos.slice(0, 1).map((remotePhoto) => normalizeRemotePhoto(remotePhoto)))
}

function normalizeAnchorValues(anchorValues) {
  if (!anchorValues || typeof anchorValues !== 'object' || Array.isArray(anchorValues)) {
    return Object.freeze({})
  }

  const nextValues = {}
  for (const [key, rawValue] of Object.entries(anchorValues)) {
    const normalizedValue = trimOptionalString(rawValue)
    if (!normalizedValue) {
      continue
    }

    nextValues[key] = normalizedValue
  }

  return Object.freeze(nextValues)
}

function normalizeLocation(location) {
  if (!location || typeof location !== 'object') {
    throw new Error('location is required.')
  }

  const latitude = location.latitude
  const longitude = location.longitude

  if (typeof latitude !== 'number' || !Number.isFinite(latitude)) {
    throw new Error('location.latitude is invalid.')
  }

  if (typeof longitude !== 'number' || !Number.isFinite(longitude)) {
    throw new Error('location.longitude is invalid.')
  }

  const normalizedName = trimOptionalString(location.name)
  const normalizedAddress = trimOptionalString(location.address)

  return Object.freeze({
    latitude,
    longitude,
    coordinateSystem: 'gcj02',
    source: location.source === 'current' ? 'current' : 'manual',
    name: normalizedName || normalizedAddress || '未命名位置',
    address: normalizedAddress || normalizedName || '',
    province: trimOptionalString(location.province),
    city: trimOptionalString(location.city),
    district: trimOptionalString(location.district),
    street: trimOptionalString(location.street),
    poiId: trimOptionalString(location.poiId),
  })
}

function normalizeSharePayload(payload, now = Date.now()) {
  if (!payload || typeof payload !== 'object') {
    throw new Error('share payload is required.')
  }

  const shareId =
    trimOptionalString(payload.requestedShareId) ||
    `share_${now.toString(36)}_${Math.random().toString(36).slice(2, 14)}`
  const sourceItemId = trimOptionalString(payload.sourceItemId)
  const sceneType = trimOptionalString(payload.sceneType)
  const shareCardTitle = trimOptionalString(payload.shareCardTitle)
  const shareCardSubtitle = trimOptionalString(payload.shareCardSubtitle) || ''

  if (!sourceItemId) {
    throw new Error('sourceItemId is required.')
  }

  if (!sceneType) {
    throw new Error('sceneType is required.')
  }

  if (!shareCardTitle) {
    throw new Error('shareCardTitle is required.')
  }

  return Object.freeze({
    shareId,
    sourceItemId,
    createdAt: normalizeTimestamp(payload.createdAt, 'createdAt'),
    updatedAt: normalizeTimestamp(payload.updatedAt, 'updatedAt'),
    sceneType,
    location: normalizeLocation(payload.location),
    anchorValues: normalizeAnchorValues(payload.anchorValues),
    note: trimOptionalString(payload.note) || '',
    reminderAt: normalizeOptionalTimestamp(payload.reminderAt, 'reminderAt'),
    remotePhotos: normalizeRemotePhotos(payload.remotePhotos),
    shareCardTitle,
    shareCardSubtitle,
  })
}

function buildSnapshotDocument(payload, now = Date.now()) {
  const normalizedPayload = normalizeSharePayload(payload, now)
  const expiresAt = now + SHARE_EXPIRATION_DURATION_MS

  return Object.freeze({
    shareId: normalizedPayload.shareId,
    schemaVersion: 1,
    sourceItemId: normalizedPayload.sourceItemId,
    createdAt: normalizedPayload.createdAt,
    updatedAt: normalizedPayload.updatedAt,
    expiresAt,
    sceneType: normalizedPayload.sceneType,
    location: normalizedPayload.location,
    anchorValues: normalizedPayload.anchorValues,
    note: normalizedPayload.note,
    reminderAt: normalizedPayload.reminderAt,
    hasImage: normalizedPayload.remotePhotos.length > 0,
    remotePhotos: normalizedPayload.remotePhotos,
    shareCardTitle: normalizedPayload.shareCardTitle,
    shareCardSubtitle: normalizedPayload.shareCardSubtitle,
  })
}

module.exports = {
  SHARE_EXPIRATION_DURATION_MS,
  buildSnapshotDocument,
  trimOptionalString,
}
