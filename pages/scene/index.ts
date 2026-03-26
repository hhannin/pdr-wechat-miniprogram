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
  readonly description: string
  readonly eyebrow: string
  readonly detail: string
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
      readonly detail: string
    }
  >
> = {
  default: {
    eyebrow: '自由记录',
    detail: '没有固定字段约束，适合临时地点、园区角落或难以归类的回找需求。',
  },
  parking_lot: {
    eyebrow: '最后 50 米',
    detail: '优先记住楼层、区域和停车位，让回车路线尽量直接、少绕路。',
  },
  mall: {
    eyebrow: '室内回找',
    detail: '围绕楼层、店铺和服务设施组织信息，更适合大型商场和综合体。',
  },
  hospital: {
    eyebrow: '就诊动线',
    detail: '把楼层、诊室和服务设施连起来，减少在院区内部反复找路的焦虑。',
  },
  scenic_area: {
    eyebrow: '开放空间',
    detail: '聚焦大门、服务设施和路径标识，保留真正对回找有帮助的语义线索。',
  },
}

const SCENE_CARDS: readonly SceneCardView[] = listSceneDefinitions().map((sceneDefinition) => {
  const sceneCopy = SCENE_COPY[sceneDefinition.type]

  return {
    sceneType: sceneDefinition.type,
    label: sceneDefinition.label,
    description: sceneDefinition.description,
    eyebrow: sceneCopy?.eyebrow ?? '地点记录',
    detail: sceneCopy?.detail ?? sceneDefinition.description,
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
