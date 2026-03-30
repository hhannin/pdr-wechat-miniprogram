import type { SceneType } from '../../core/types/index'
import { listSceneDefinitions } from '../../core/scene/index'
import {
  buildCreateRecordUrl,
  FRONTEND_PRIMARY_NAV,
  type FrontendPrimaryNavItem,
} from '../index/frontend-config'

interface SceneCardView {
  readonly sceneType: SceneType
  readonly label: string
  readonly eyebrow: string
  readonly summary: string
  readonly createUrl: string
}

interface ScenePageData {
  readonly sceneCards: readonly SceneCardView[]
  readonly footerNavItems: readonly FooterNavItemView[]
}

interface FooterNavItemView extends FrontendPrimaryNavItem {
  readonly isActive: boolean
}

const SCENE_COPY: Readonly<
  Record<
    SceneType,
    {
      readonly eyebrow: string
      readonly summary: string
    }
  >
> = {
  default: {
    eyebrow: '自由记录',
    summary: '照片 / 位置 / 补充',
  },
  parking_lot: {
    eyebrow: '最后50m',
    summary: '楼层 / 区域 / 车位',
  },
  mall: {
    eyebrow: '室内找回',
    summary: '楼层 / 店铺 / 设施',
  },
  hospital: {
    eyebrow: '诊区找回',
    summary: '楼层 / 诊室 / 设施',
  },
  scenic_area: {
    eyebrow: '沿路找回',
    summary: '大门 / 设施 / 标识',
  },
}

const SCENE_CARDS: readonly SceneCardView[] = listSceneDefinitions().map((sceneDefinition) => {
  const sceneCopy = SCENE_COPY[sceneDefinition.type]

  return {
    sceneType: sceneDefinition.type,
    label: sceneDefinition.label,
    eyebrow: sceneCopy?.eyebrow ?? '记这里',
    summary: sceneCopy?.summary ?? sceneDefinition.description,
    createUrl: buildCreateRecordUrl(sceneDefinition.type),
  }
})

const FOOTER_NAV_ITEMS: readonly FooterNavItemView[] = FRONTEND_PRIMARY_NAV.map((navItem) => ({
  ...navItem,
  isActive: navItem.key === 'scene',
}))

Page<ScenePageData>({
  data: {
    sceneCards: SCENE_CARDS,
    footerNavItems: FOOTER_NAV_ITEMS,
  },
})
