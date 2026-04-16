'use strict'

const fs = require('fs')
const cloud = require('wx-server-sdk')
const {
  buildSnapshotDocument,
  trimOptionalString,
} = require('./share-helpers')

const SHARE_COLLECTION_NAME = 'share_snapshots'
const TEXT_REJECTED_MESSAGE = '分享内容暂不支持分享，请调整后重试。'
const IMAGE_REJECTED_MESSAGE = '分享图片暂不支持分享，请调整后重试。'
const AUDIT_FAILED_MESSAGE = '分享审核失败，请稍后重试。'

cloud.init({
  env: cloud.DYNAMIC_CURRENT_ENV,
})

function buildTextAuditContent(snapshotDocument) {
  const lines = []

  const pushLine = (label, value) => {
    const normalizedValue = trimOptionalString(value)
    if (!normalizedValue) {
      return
    }

    lines.push(`${label}：${normalizedValue}`)
  }

  pushLine('分享标题', snapshotDocument.shareCardTitle)
  pushLine('分享副标题', snapshotDocument.shareCardSubtitle)
  pushLine('位置名称', snapshotDocument.location && snapshotDocument.location.name)
  pushLine('位置地址', snapshotDocument.location && snapshotDocument.location.address)
  pushLine('场景', snapshotDocument.sceneType)

  if (
    snapshotDocument.anchorValues &&
    typeof snapshotDocument.anchorValues === 'object' &&
    !Array.isArray(snapshotDocument.anchorValues)
  ) {
    for (const [key, value] of Object.entries(snapshotDocument.anchorValues)) {
      pushLine(`字段:${key}`, value)
    }
  }

  pushLine('备注', snapshotDocument.note)
  return lines.join('\n')
}

function isAuditRejectedError(error) {
  const errorCode =
    typeof error?.errCode === 'number'
      ? error.errCode
      : typeof error?.code === 'number'
        ? error.code
        : undefined
  const errorMessage =
    typeof error?.errMsg === 'string'
      ? error.errMsg
      : typeof error?.message === 'string'
        ? error.message
        : ''

  if (errorCode === 87014) {
    return true
  }

  return /risky|risk|违规|敏感|违法|content/i.test(errorMessage)
}

function assertAuditPassed(result, rejectedMessage) {
  if (!result || typeof result !== 'object') {
    return
  }

  const suggest =
    typeof result.suggest === 'string'
      ? result.suggest.trim().toLowerCase()
      : typeof result.result === 'string'
        ? result.result.trim().toLowerCase()
        : ''
  const errCode = typeof result.errCode === 'number' ? result.errCode : 0

  if (suggest && suggest !== 'pass') {
    throw new Error(rejectedMessage)
  }

  if (errCode !== 0) {
    throw new Error(rejectedMessage)
  }
}

async function auditTextContent(snapshotDocument) {
  const content = buildTextAuditContent(snapshotDocument)
  if (!content) {
    return
  }

  try {
    const result = await cloud.openapi.security.msgSecCheck({
      content,
    })
    assertAuditPassed(result, TEXT_REJECTED_MESSAGE)
  } catch (error) {
    if (error instanceof Error && error.message === TEXT_REJECTED_MESSAGE) {
      throw error
    }

    if (isAuditRejectedError(error)) {
      throw new Error(TEXT_REJECTED_MESSAGE)
    }

    throw new Error(AUDIT_FAILED_MESSAGE)
  }
}

function normalizeAuditImageContentType(remotePhoto) {
  const mimeType =
    typeof remotePhoto?.mimeType === 'string' ? remotePhoto.mimeType.trim().toLowerCase() : ''
  if (mimeType === 'image/jpg') {
    return 'image/jpeg'
  }

  if (mimeType.startsWith('image/')) {
    return mimeType
  }

  const fileName =
    typeof remotePhoto?.fileName === 'string' ? remotePhoto.fileName.trim().toLowerCase() : ''
  if (fileName.endsWith('.png')) {
    return 'image/png'
  }

  if (fileName.endsWith('.gif')) {
    return 'image/gif'
  }

  if (fileName.endsWith('.webp')) {
    return 'image/webp'
  }

  return 'image/jpeg'
}

async function loadRemotePhotoBuffer(fileId) {
  const downloadResult = await cloud.downloadFile({
    fileID: fileId,
  })

  if (Buffer.isBuffer(downloadResult.fileContent)) {
    return downloadResult.fileContent
  }

  if (typeof downloadResult.tempFilePath === 'string' && downloadResult.tempFilePath.length > 0) {
    return fs.readFileSync(downloadResult.tempFilePath)
  }

  throw new Error(AUDIT_FAILED_MESSAGE)
}

async function auditImageContent(snapshotDocument) {
  if (!Array.isArray(snapshotDocument.remotePhotos) || snapshotDocument.remotePhotos.length === 0) {
    return
  }

  const remotePhoto = snapshotDocument.remotePhotos[0]

  try {
    const fileBuffer = await loadRemotePhotoBuffer(remotePhoto.fileId)
    const result = await cloud.openapi.security.imgSecCheck({
      media: {
        contentType: normalizeAuditImageContentType(remotePhoto),
        value: fileBuffer,
      },
    })
    assertAuditPassed(result, IMAGE_REJECTED_MESSAGE)
  } catch (error) {
    if (error instanceof Error && error.message === IMAGE_REJECTED_MESSAGE) {
      throw error
    }

    if (isAuditRejectedError(error)) {
      throw new Error(IMAGE_REJECTED_MESSAGE)
    }

    throw new Error(AUDIT_FAILED_MESSAGE)
  }
}

exports.main = async (event) => {
  const db = cloud.database()
  const snapshotDocument = buildSnapshotDocument(event, Date.now())

  await Promise.all([
    auditTextContent(snapshotDocument),
    auditImageContent(snapshotDocument),
  ])

  await db.collection(SHARE_COLLECTION_NAME).doc(snapshotDocument.shareId).set({
    data: snapshotDocument,
  })

  return {
    shareId: snapshotDocument.shareId,
    expiresAt: snapshotDocument.expiresAt,
    shareCardTitle: snapshotDocument.shareCardTitle,
    shareCardSubtitle: snapshotDocument.shareCardSubtitle,
  }
}
