"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const runtime_1 = require("../common/runtime");
const frontend_presenters_1 = require("../common/frontend-presenters");
const frontend_config_1 = require("../common/frontend-config");
function showToastMessage(title, icon = 'none') {
    wx.showToast({
        title,
        icon,
        duration: 1800,
    });
}
function formatErrorMessage(error) {
    if (error instanceof Error && error.message.trim().length > 0) {
        return error.message.trim();
    }
    if (error &&
        typeof error === 'object' &&
        'errMsg' in error &&
        typeof error.errMsg === 'string') {
        const errMsg = error.errMsg.trim();
        if (errMsg.length > 0) {
            return errMsg;
        }
    }
    return '发生未知错误。';
}
async function reLaunch(url) {
    await new Promise((resolve, reject) => {
        wx.reLaunch({
            url,
            success: () => resolve(),
            fail: (error) => reject(error),
        });
    });
}
async function previewPhoto(path) {
    await new Promise((resolve, reject) => {
        wx.previewImage({
            current: path,
            urls: [path],
            success: () => resolve(),
            fail: (error) => reject(error),
        });
    });
}
function syncExpiredState(page) {
    page.currentSharedItem = null;
    page.setData({
        pageStatus: 'expired',
        sceneLabel: '',
        shareCardTitle: '',
        shareCardSubtitle: '',
        fieldViews: [],
        hasFilledFields: false,
        hasLocation: false,
        locationTitle: '',
        locationSubtitle: '',
        hasPhoto: false,
        photoPath: '',
        imageState: 'none',
        hasNote: false,
        noteDisplayText: '',
    });
}
function syncRequiresNetworkState(page) {
    page.currentSharedItem = null;
    page.setData({
        pageStatus: 'requires_network',
        sceneLabel: '',
        shareCardTitle: '',
        shareCardSubtitle: '',
        fieldViews: [],
        hasFilledFields: false,
        hasLocation: false,
        locationTitle: '',
        locationSubtitle: '',
        hasPhoto: false,
        photoPath: '',
        imageState: 'none',
        hasNote: false,
        noteDisplayText: '',
    });
}
function syncReadyState(page, sharedItem) {
    page.currentSharedItem = sharedItem;
    const fieldViews = (0, frontend_presenters_1.buildFieldViews)(sharedItem.sceneType, sharedItem.anchorValues).filter((fieldView) => (0, frontend_presenters_1.trimOptionalString)(fieldView.value) !== undefined);
    const locationPresentation = (0, frontend_presenters_1.buildLocationPresentation)(sharedItem.location);
    const photoPresentation = (0, frontend_presenters_1.buildPhotoPresentation)(sharedItem.photos[0], 'view');
    page.setData({
        pageStatus: 'ready',
        sceneLabel: (0, frontend_presenters_1.getSceneLabel)(sharedItem.sceneType),
        shareCardTitle: (0, frontend_presenters_1.buildShareCardTitleFromItem)(sharedItem),
        shareCardSubtitle: (0, frontend_presenters_1.buildShareCardSubtitleFromItem)(sharedItem),
        fieldViews,
        hasFilledFields: fieldViews.length > 0,
        hasLocation: locationPresentation.hasLocation,
        locationTitle: locationPresentation.title,
        locationSubtitle: locationPresentation.subtitle,
        hasPhoto: photoPresentation.hasPhoto,
        photoPath: photoPresentation.photoPath,
        imageState: sharedItem.imageState,
        hasNote: (0, frontend_presenters_1.trimOptionalString)(sharedItem.note) !== undefined,
        noteDisplayText: (0, frontend_presenters_1.buildNoteDisplayText)(sharedItem.note),
    });
}
async function hydrateSharedImage(page) {
    if (!page.shareId || !page.currentSharedItem?.hasRemoteImage) {
        return;
    }
    if (page.currentSharedItem.photos.length > 0 && page.currentSharedItem.imageState === 'ready') {
        return;
    }
    const nextSharedItem = await page.runtime.ensureSharedImage(page.shareId);
    if (!nextSharedItem) {
        return;
    }
    syncReadyState(page, nextSharedItem);
}
Page({
    data: {
        pageStatus: 'loading',
        sceneLabel: '',
        shareCardTitle: '',
        shareCardSubtitle: '',
        fieldViews: [],
        hasFilledFields: false,
        hasLocation: false,
        locationTitle: '',
        locationSubtitle: '',
        hasPhoto: false,
        photoPath: '',
        imageState: 'none',
        hasNote: false,
        noteDisplayText: '',
    },
    runtime: runtime_1.appRuntime,
    shareId: '',
    currentSharedItem: null,
    async onLoad(options) {
        const shareId = (0, frontend_presenters_1.trimOptionalString)(options.shareId);
        if (!shareId) {
            syncExpiredState(this);
            return;
        }
        this.shareId = shareId;
        try {
            const result = await this.runtime.openSharedSnapshot(shareId);
            if (result.status === 'expired') {
                syncExpiredState(this);
                return;
            }
            if (result.status === 'requires_network') {
                syncRequiresNetworkState(this);
                return;
            }
            syncReadyState(this, result.item);
            void hydrateSharedImage(this);
        }
        catch (error) {
            showToastMessage(`打开分享失败：${formatErrorMessage(error)}`);
            syncExpiredState(this);
        }
    },
    async handleBackHome() {
        try {
            await reLaunch(frontend_config_1.FRONTEND_ROUTES.scene);
        }
        catch (error) {
            showToastMessage(`回到首页失败：${formatErrorMessage(error)}`);
        }
    },
    async handleOpenLocation() {
        if (this.data.pageStatus !== 'ready' || !this.currentSharedItem) {
            return;
        }
        try {
            await this.runtime.openLocation(this.currentSharedItem.location);
        }
        catch (error) {
            showToastMessage(`打开地图失败：${formatErrorMessage(error)}`);
        }
    },
    async handlePhotoTap() {
        if (this.data.pageStatus !== 'ready') {
            return;
        }
        const activePhoto = this.currentSharedItem?.photos[0];
        if (!activePhoto) {
            if (this.data.imageState === 'pending') {
                showToastMessage('图片加载中');
                return;
            }
            if (this.data.imageState === 'failed') {
                await this.handleRetryImage();
            }
            return;
        }
        try {
            await previewPhoto(activePhoto.localPath);
        }
        catch (error) {
            showToastMessage(`打开照片失败：${formatErrorMessage(error)}`);
        }
    },
    async handleRetryImage() {
        if (this.data.pageStatus !== 'ready' || !this.shareId) {
            return;
        }
        try {
            const nextSharedItem = await this.runtime.ensureSharedImage(this.shareId);
            if (!nextSharedItem) {
                return;
            }
            syncReadyState(this, nextSharedItem);
        }
        catch (error) {
            showToastMessage(`重新加载图片失败：${formatErrorMessage(error)}`);
        }
    },
});
