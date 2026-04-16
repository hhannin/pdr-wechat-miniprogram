记这里 / 找回去 当前线上版本冻结说明
更新时间：2026-04-16

本文件用于冻结当前已上线版本的产品设计、前端交互、数据模型、本地存储、分享链路、提醒链路和云函数职责。
后续新增需求或排查问题时，优先阅读本文件恢复上下文。


一、项目定位

小程序名称：记这里 / 找回去。

核心目标：
1. 用户能在 10 秒左右快速记录一个位置。
2. 记录内容以本地个人记录为主，支持位置、地址、场景、备注、照片、提醒时间。
3. 用户可在速记列表中找回记录，可导航、查看图片、收藏、删除。
4. 用户可主动生成“分享快照”发给微信好友，接收方只读查看。
5. 用户可设置一次性提醒，到点后通过微信订阅消息提醒。

当前产品取舍：
1. 首页就是创建记录页 pages/record/index，不再是场景选择页。
2. “收藏”替代之前的“置顶”概念；收藏页只显示已收藏记录。
3. 当前没有单独的提醒列表区域；提醒在记录卡片里用提醒图标和提醒时间表达。
4. 分享快照是 24 小时有效的临时云端数据，到期不可访问，并由定时任务物理清理。
5. 首页原生分享只代表“推荐小程序本身”，不使用分享快照封面。
6. 记录分享快照代表“分享某条记录内容”，使用固定中性分享封面。
7. 当前没有开放“分享到朋友圈”；只开放“转发给朋友”。


二、目录和工程结构

项目根目录：
/Users/yinhuihan/WeChatProjects/foots

重要目录：
1. miniprogram/
   小程序前端源码。当前 Git 仓库根目录在这里。

2. cloudfunctions/
   微信云函数源码。project.config.json 中 cloudfunctionRoot 指向这里。

3. project.config.json
   微信开发者工具项目配置：
   - miniprogramRoot: miniprogram/
   - cloudfunctionRoot: cloudfunctions/
   - appid: wxbb3b8cd5fdd2e86e
   - useCompilerPlugins: typescript

4. miniprogram/app.json
   页面注册和基础权限说明。

5. miniprogram/app.ts
   小程序启动入口，初始化 wx.cloud，启动和前台恢复时清理本地过期分享缓存。

注意：
1. 微信开发者工具会把 TypeScript 编译成同名 .js 文件落在 miniprogram 目录。
2. 当前 miniprogram/.gitignore 没有忽略这些同名 .js 编译产物。
3. 提交前通常需要清掉这些编译产物。


三、页面路由

当前 app.json 注册页面顺序：
1. pages/record/index
   首页、创建记录页，同时也承载编辑记录模式。

2. pages/records/index
   速记列表页，展示全部记录，按有效时间排序，带日期 scrubber。

3. pages/post-view/index
   记录详情页。

4. pages/favorites/index
   收藏页，只展示已收藏记录。

5. pages/share/index
   分享快照只读查看页。


四、主要页面职责

1. pages/record/index

职责：
1. 首页创建记录。
2. 编辑已有记录。
3. 选择位置。
4. 输入备注。
5. 设置提醒。
6. 展开“更多线索”：照片、场景、场景字段。
7. 保存记录。
8. 删除记录。
9. 允许原生“转发给朋友”分享小程序本身。

页面模式：
1. create
   默认首页。可选择位置、填写备注、提醒、照片、场景和字段。

2. edit
   通过 query mode=edit&itemId=... 进入。可编辑备注、提醒、字段；位置和场景保持冻结，不允许改。

保存条件：
1. 创建时必须有位置。
2. 编辑时默认允许保存。
3. busy 时锁住保存/删除等关键操作。

首页原生分享：
1. onShareAppMessage 返回 title: “记这里”。
2. path 指向 /pages/record/index。
3. 不传 imageUrl，避免和“分享快照”混淆。
4. 不支持朋友圈分享。


2. pages/records/index

职责：
1. 展示全部记录。
2. 下拉刷新。
3. 恢复 sync_failed 的未来提醒。
4. 点击记录进入详情。
5. 点击照片预览。
6. 点击导航打开地图。
7. 点击删除删除记录。
8. 右上 + 回创建页。
9. 左上收藏入口进入收藏页。
10. 原生分享逻辑：如果当前有已准备好的分享快照，分享快照；否则分享小程序本身。

排序：
1. 默认按 resolveEffectiveTimestamp 倒序。
2. 未过期提醒仍按 createdAt 参与排序。
3. 已过期提醒按 reminderAt 参与排序。

日期 scrubber：
1. 从 postViews 的 dateKey 生成。
2. 切换日期时滚动到对应记录。

当前列表卡片底部右侧图标：
1. 导航图标。
2. 删除图标。

说明：
列表页当前不是“置顶/提醒/日期”三段结构，而是扁平列表 + 日期 scrubber。这是当前线上产品形态。


3. pages/post-view/index

职责：
1. 展示单条记录详情。
2. 导航。
3. 查看照片。
4. 打开分享快照选择框。
5. 收藏/取消收藏。
6. 编辑。
7. 删除。

提醒通知落地：
1. 订阅消息点击后进入 pages/post-view/index?itemId=...&source=reminder。
2. 如果 item 存在，直接展示详情。
3. 如果 item 已删除，reLaunch 到首页，并通过 toast 提示“记录已被删除”。

原生分享：
1. 如果 shareFlow 已准备好，分享快照。
2. 否则分享小程序本身 title “记这里”。
3. 不支持朋友圈分享。


4. pages/favorites/index

职责：
1. 展示已收藏记录。
2. 收藏排序按 pinnedAt 倒序。
3. 下拉刷新。
4. 恢复 sync_failed 的未来提醒。
5. 点击记录进入详情。
6. 点击照片预览。
7. 点击导航。
8. 点击收藏图标取消收藏。
9. 删除记录。
10. 原生分享逻辑同列表页。

说明：
收藏是通过 Item.pinnedAt 表达的。


5. pages/share/index

职责：
1. 通过 shareId 打开分享快照。
2. 首次在线打开时从云端 getShareSnapshot 拉取。
3. 本地有未过期 shared 缓存时可离线查看。
4. 首次离线无缓存时显示需要联网。
5. 过期时显示失效状态。
6. 支持查看图片。
7. 支持打开位置导航。
8. 底部有固定“返回小程序主页”按钮。
9. 接收方只读，不可保存副本，不可编辑，不产生提醒功能。

分享页中的提醒：
1. 如果分享快照包含 reminderAt，分享查看页显示中性的提醒图标 + 提醒时间。
2. 颜色是中性灰，不表达可提醒/已启用状态。

分享页再次原生转发：
1. title 使用 currentSharedItem.location.name，兜底“分享快照”。
2. path 指向 /pages/share/index?shareId=...
3. imageUrl 使用固定中性封面 /assets/share/share-cover.png。


五、核心组件

1. components/top-toolbar
通用固定顶部工具栏。

2. components/post-card
通用记录卡片。

mode:
1. list
   用于速记列表、收藏列表。点击卡片进入详情。底部右侧展示导航和删除。

2. detail
   用于详情页。底部右侧展示导航、分享和 more；展开后显示收藏、编辑、删除。

3. share
   用于分享查看页。显示只读内容和中性提醒信息。

照片逻辑：
1. 普通图使用 widthFix。
2. 高竖图 height / width > 1.5 时进入 fallback。
3. fallback 会按固定高度计算自然宽度，保持完整显示并左对齐，避免左侧大留白和裁切。

提醒显示：
1. 普通记录：future + scheduled 为绿色；future + unscheduled/sync_failed 为灰色；过期或无提醒不显示。
2. 分享模式：有 reminderBadgeText 就显示中性灰。

3. components/share-sheet
分享选择弹框。
1. 位置为固定包含项，不可取消。
2. 场景类型始终包含，但不单独作为选择项显示。
3. 有图片时显示“图片”选择项，默认勾选。
4. 有值场景字段逐项显示，默认勾选。
5. 有备注时显示“备注”，默认勾选。
6. 有提醒时间时显示“提醒时间”，默认勾选。
7. 底部按钮状态：准备中 / 分享给好友 / 点击重试。
8. 提示文案：“敏感信息请勿分享给陌生人”。

4. components/date-scrubber
列表页右侧日期快速定位。


六、数据模型

Item:
1. schemaVersion: 2
2. id
3. createdAt
4. updatedAt
5. pinnedAt?
6. sceneType
7. anchorValues
8. note
9. reminderAt?
10. reminderSyncState?
11. location
12. photos

ReminderSyncState:
1. scheduled
   已拿到订阅授权并且云端 reminder job 同步成功。

2. unscheduled
   未授权、拒绝授权、没有模板 ID、权限请求失败，或未启用提醒。

3. sync_failed
   用户意图启用提醒，但云端 syncReminderJob 失败。前端显示灰色；下拉刷新时可尝试恢复。

ItemSummary:
1. 用于列表索引。
2. 包含 id、sceneType、createdAt、updatedAt、pinnedAt、reminderAt、reminderSyncState、locationName、address、coverPhotoPath、primaryAnchors、notePreview。

SharedItem:
1. 继承 Item 主体。
2. 额外包含 shareId、expiresAt、sourceItemId、hasRemoteImage、imageState、remoteImageFileId、remotePhotos。
3. 只用于分享页本地缓存，不进入普通记录列表。


七、本地存储

本地存储根：
通过 wx.env.USER_DATA_PATH 下的 foots/storage 管理。

普通记录：
1. LocalItemRepository 管理 item JSON 和 summary index。
2. ItemPhotoStore 管理本地记录照片文件。
3. 删除记录时删除对应 item 目录。

分享缓存：
1. LocalSharedRepository 以 shareId 为唯一键。
2. SharedPhotoStore 缓存分享页下载的远端图片。
3. app.ts 在 onLaunch 和 onShow 时调用 clearExpiredSharedSnapshots。
4. 过期 shared 会从本地删除。

编译产物：
1. 微信开发者工具会生成同名 .js。
2. 提交前需清理。


八、记录创建和编辑流程

创建流程：
1. 首页打开 pages/record/index，默认 create。
2. 用户选择位置。
3. 可填写备注。
4. 可开启提醒并选日期/时间。
5. 可展开更多线索：照片、场景、场景字段。
6. 点击保存。
7. 如果开启提醒，保存时调用 wx.requestSubscribeMessage。
8. 如果用户接受订阅，尝试 syncReminderJob。
9. syncReminderJob 成功则 reminderSyncState=scheduled。
10. syncReminderJob 失败则 reminderSyncState=sync_failed。
11. 权限未通过或权限请求失败则 reminderSyncState=unscheduled。
12. 本地保存 item。

编辑流程：
1. 从详情页或列表进入 pages/record/index?mode=edit&itemId=...
2. 位置和场景冻结。
3. 备注、提醒、字段可改。
4. 已有照片时不可替换；无照片时可补照片。
5. 删除提醒时，云端取消是 best effort。
6. 修改提醒时间且权限通过时，尝试同步云端。
7. 当前线上接受的取舍：如果编辑提醒同步失败，前端会保存新 reminderAt 并标记 sync_failed，后续可通过列表/收藏下拉刷新尝试恢复。

删除记录：
1. 删除前弹确认。
2. 如果有未来提醒且有网络，尝试 syncReminderJob 取消云端提醒。
3. 云端取消失败时仍允许删除本地记录。
4. 如果后续旧提醒仍发出，点击通知会尝试打开详情；发现记录已删除后回首页并提示。


九、分享快照流程

入口：
1. 详情页 post-view 的分享按钮。
2. 列表/收藏页当前 post-card list mode 不显示分享入口，但页面仍具备 shareFlow 能力。
3. 分享查看页可再次转发已存在的分享链接。

分享选择：
1. 点击分享后打开 share-sheet。
2. 位置固定包含。
3. sceneType 始终包含，不显示选择项。
4. 图片、字段、备注、提醒时间按是否有值显示，默认勾选。
5. 每次选择变化后 320ms 防抖重新准备。
6. 同一 item.updatedAt + selection fingerprint 命中缓存时直接 ready。

准备流程：
1. ShareFlowController 调用 runtime.prepareShareSnapshot。
2. 如果选择图片，只上传第一张本地图片到云存储 shares/{shareId}/photos/0-{fileName}。
3. 调用 createShareSnapshot 云函数。
4. 云函数做文本审核和图片审核。
5. 通过后写入 share_snapshots。
6. 返回 shareId、expiresAt、shareCardTitle、shareCardSubtitle。
7. 前端按钮从“准备中”变成“分享给好友”。
8. 用户点击原生 open-type=share 发出。

分享卡片：
1. 记录分享快照使用固定中性封面 /assets/share/share-cover.png。
2. title 使用 shareCardTitle，兜底“分享快照”。
3. path 指向 /pages/share/index?shareId=...

首页分享和分享快照的区别：
1. 首页 onShareAppMessage 只分享小程序本身，title 为“记这里”，path 为首页，不传 imageUrl。
2. 记录分享快照分享具体内容，使用 shareId 和固定封面。

接收流程：
1. pages/share/index 读取 shareId。
2. 先查本地 shared 缓存。
3. 本地未过期则直接显示。
4. 本地无缓存时调用 getShareSnapshot。
5. 云端不存在或过期则显示失效。
6. 首次离线且无缓存显示 requires_network。
7. 有远端图片时先展示文本，再 best-effort 下载图片并缓存。

过期和清理：
1. 分享有效期 24 小时。
2. getShareSnapshot 读时按 expiresAt 兜底拒绝访问。
3. cleanupExpiredShares 每 6 小时清理过期 share_snapshots 和云存储图片。
4. 本地 shared 缓存随 expiresAt 清理。


十、提醒流程

提醒模板：
1. 前端模板 ID 在 miniprogram/pages/common/reminder-config.ts。
2. 云端模板配置在 cloudfunctions/dispatchDueReminders/reminder-config.js。
3. 当前模板 ID：HpURo3YBuk3eHxHaYTzViDKnGXaX3Q6WQbTxVlvGugg。
4. keywordMap:
   - title -> thing2
   - time -> date4
   - subtitle -> thing10
5. miniprogramState 当前为 trial。

创建/编辑提醒：
1. 用户开启提醒并选择日期/时间。
2. 点击保存时请求 wx.requestSubscribeMessage。
3. 只有接受授权时才尝试同步云端。
4. 未授权/权限请求失败记录为 unscheduled，显示灰色。
5. 已授权但云端失败记录为 sync_failed，显示灰色。
6. 已授权且云端成功记录为 scheduled，显示绿色。

云端同步：
1. 前端调用 syncReminderJob。
2. job 文档 id 为 {OPENID}__{itemId}。
3. scheduled 时写入/覆盖 reminder_jobs。
4. 取消、过期或 unscheduled 时，若已有 job 则标记 cancelled。

云端派发：
1. dispatchDueReminders 每分钟触发。
2. 查询 status=scheduled 且 reminderAt<=now 的 job。
3. 调用 subscribeMessage.send。
4. 成功后标记 sent。
5. 失败后标记 failed，并写 lastError。

通知内容：
1. 提醒内容使用 locationTitle，thing 类型最多 15 字，超出补 ...
2. 日程时间优先使用保存提醒时前端生成的 reminderDisplayText。
3. 地点使用 locationSubtitle，超出 15 字补 ...

通知点击：
1. pagePath 为 pages/post-view/index?itemId=...&source=reminder。
2. 记录存在则打开详情。
3. 记录不存在则回首页提示“记录已被删除”。

恢复 sync_failed：
1. records/favorites 下拉刷新时执行。
2. 只处理未来提醒且 reminderSyncState=sync_failed 的记录。
3. 不处理 unscheduled，避免误触用户未授权的提醒。
4. 总超时 2500ms。
5. 成功恢复后写本地为 scheduled，并 toast “已恢复 N 条提醒”。


十一、云函数

1. createShareSnapshot
路径：../cloudfunctions/createShareSnapshot
职责：
1. 校验分享 payload。
2. 生成 24 小时 expiresAt。
3. 文本内容安全审核：标题、副标题、位置、地址、场景、字段、备注。
4. 图片内容安全审核：下载云存储首图后调用 imgSecCheck。
5. 审核通过后写 share_snapshots。
6. 返回 shareId/expiresAt/title/subtitle。

配置：
1. openapi 权限：security.msgSecCheck、security.imgSecCheck。
2. 部署时建议调高超时时间和内存，默认 3 秒对带图审核可能不稳定。

2. getShareSnapshot
路径：../cloudfunctions/getShareSnapshot
职责：
1. 根据 shareId 查询 share_snapshots。
2. 不存在、无效、过期返回 expired。
3. 未过期返回 ready snapshot。

当前实现说明：
1. 当前用 where({ shareId }).limit(1).get() 查询。
2. createShareSnapshot 写入时 doc id 也是 shareId。
3. 如后续优化首开速度，可考虑改为 doc(shareId).get()。

3. cleanupExpiredShares
路径：../cloudfunctions/cleanupExpiredShares
职责：
1. 每 6 小时扫描 expiresAt <= now 的分享快照。
2. 删除快照关联云存储图片。
3. 删除 share_snapshots 文档。

触发器：
config: 0 0 */6 * * * *

4. syncReminderJob
路径：../cloudfunctions/syncReminderJob
职责：
1. 根据 OPENID + itemId 写入/更新/取消 reminder job。
2. scheduled + future reminderAt 写 status=scheduled。
3. 非 scheduled、无 reminderAt、或 reminderAt 过期时，如果已有 job，则标记 cancelled。

集合：
reminder_jobs。

5. dispatchDueReminders
路径：../cloudfunctions/dispatchDueReminders
职责：
1. 每分钟扫描到期 reminder_jobs。
2. 调用 subscribeMessage.send。
3. 成功标记 sent。
4. 失败标记 failed。

触发器：
config: 0 */1 * * * * *

权限：
subscribeMessage.send。


十二、云数据库和云存储

数据库集合：
1. share_snapshots
   分享快照。
   建议索引：expiresAt。

2. reminder_jobs
   提醒任务。
   建议组合索引：status ASC + reminderAt ASC。

云存储：
1. 分享图片路径：shares/{shareId}/photos/...
2. 本地记录图片不上传云端，只有分享时选择图片才上传分享图。
3. 分享云端图片由 cleanupExpiredShares 清理。


十三、隐私和合规口径

已使用的用户信息类型：
1. 位置信息。
2. 选择的位置信息。
3. 地址。
4. 摄像头。
5. 选中的照片或视频信息。
6. 发布内容。

用途口径：
1. 位置信息：用于地图选点、打开已保存地点导航。
2. 选择的位置信息：用于记录你手动选择的地点信息并展示地点详情。
3. 地址：用于保存并展示地点名称与地址，帮助找回已记录的位置。
4. 摄像头：用于拍摄现场照片并保存到记录中。
5. 选中的照片或视频信息：用于保存记录图片，并在主动分享时生成分享快照。
6. 发布内容：用于保存备注、楼层、区域、提醒时间等记录内容，并在主动分享时生成分享快照。

合规处理：
1. 本地未分享数据不做内容安全审核。
2. 分享上云前做文本和图片内容安全审核。
3. 分享内容 24 小时失效并定时物理删除。
4. 提醒通过订阅消息发送一次通知。

分享隐私：
1. 分享快照不是私密好友绑定模式。
2. 拿到 shareId 的用户在有效期内可打开。
3. 风险通过选择分享内容、敏感信息提示、24 小时失效、内容审核降低。


十四、原生 API 使用

1. wx.cloud.init
app.ts 初始化，env 为 cloud1-4gdx7mux69e016b3。

2. wx.chooseLocation / wx.getLocation / wx.openLocation
用于地图选点和导航。

3. wx.chooseImage
仅使用 camera 来源拍照，sizePreference 为 compressed。

4. wx.requestSubscribeMessage
保存提醒时请求订阅消息授权。

5. wx.cloud.uploadFile / downloadFile / deleteFile / callFunction
用于分享图片、分享快照、提醒同步、分享图片缓存。

6. wx.previewImage
用于本地/分享图片预览。

7. onShareAppMessage
首页、列表、收藏、详情、分享页均有“转发给朋友”能力。

8. onShareTimeline
当前没有实现，朋友圈分享不开放。


十五、当前已知取舍

1. 首页为创建页，这是刻意设计，服务快速记录。
2. 没有单独提醒区；提醒用卡片图标和时间展示。
3. 收藏代替置顶，收藏页独立展示 pinnedAt 记录。
4. 提醒权限请求在保存时发生，不是在选择时间时发生。
5. 权限请求失败或用户拒绝时记录为 unscheduled，后续下拉刷新不会恢复。
6. 已授权但云端同步失败时记录为 sync_failed，后续列表/收藏下拉刷新可恢复。
7. 编辑提醒同步失败时，本地可保存新提醒时间并标记 sync_failed；这是当前可接受行为。
8. 删除带提醒记录时，云端取消提醒是 best effort，删除不被阻塞。
9. 分享首开性能仍可能受云函数冷启动、图片体积、审核接口影响。
10. getShareSnapshot 仍可优化成 doc(shareId).get()，当前未改。
11. 微信开发者工具会持续生成 .js 编译产物，提交前需清理。


十六、部署和运维清单

小程序：
1. 使用微信开发者工具上传 miniprogram。
2. 提交前确认没有同名 .js 编译产物。
3. 当前首页是 pages/record/index。

云函数：
需要部署：
1. createShareSnapshot
2. getShareSnapshot
3. cleanupExpiredShares
4. syncReminderJob
5. dispatchDueReminders

需要上传触发器：
1. cleanupExpiredShares
2. dispatchDueReminders

需要确认 openapi 权限：
1. createShareSnapshot: security.msgSecCheck, security.imgSecCheck
2. dispatchDueReminders: subscribeMessage.send

数据库：
1. share_snapshots 集合存在。
2. reminder_jobs 集合存在。
3. share_snapshots 建议 expiresAt 索引。
4. reminder_jobs 建议 status + reminderAt 组合索引。

提醒模板：
1. 前端和云端模板 ID 必须一致。
2. 当前模板为“日程提醒”。
3. keyword key:
   - 提醒内容：thing2
   - 日程时间：date4
   - 地点：thing10

提审/版本：
1. dispatchDueReminders/reminder-config.js 的 miniprogramState 当前为 trial。
2. 正式线上如果需要跳正式版，应改为 formal 并重新部署 dispatchDueReminders。
3. createShareSnapshot 建议保持较高超时时间和内存，避免带图审核超时。


十七、常用验证路径

1. 创建记录
首页选择位置 -> 填备注/提醒/照片/字段 -> 保存 -> 进入列表可见。

2. 编辑记录
详情页 -> 更多 -> 编辑 -> 修改备注/提醒/字段 -> 保存。

3. 收藏
详情页 -> 更多 -> 收藏 -> 收藏页可见；收藏页取消收藏后消失。

4. 删除
列表/收藏/详情删除 -> 弹确认 -> 删除后本地消失。

5. 分享快照
详情页 -> 分享 -> 选择内容 -> 等待准备完成 -> 分享给好友 -> 接收方打开分享页。

6. 分享过期
修改云端 expiresAt 为过去 -> 分享页显示过期；cleanupExpiredShares 后数据库和云存储删除。

7. 提醒
创建未来提醒 -> 保存并授权 -> 云端 reminder_jobs 为 scheduled -> 到点收到订阅消息 -> 点击进详情。

8. 提醒恢复
让提醒进入 sync_failed -> 列表或收藏页下拉刷新 -> 若网络恢复，提示已恢复并图标变绿。

9. 首页原生分享
首页右上菜单 -> 转发给朋友可用；朋友圈仍不可用。


十八、常用命令

类型检查：
npm exec --yes --package typescript tsc --noEmit

查看编译产物数量：
find /Users/yinhuihan/WeChatProjects/foots/miniprogram -type f -name "*.js" ! -path "*/.git/*" ! -path "*/miniprogram_npm/*" -print | wc -l

清理同名 .js 编译产物：
find /Users/yinhuihan/WeChatProjects/foots/miniprogram -type f -name "*.js" ! -path "*/.git/*" ! -path "*/miniprogram_npm/*" -exec sh -c 'for f do t=${f%.js}.ts; [ -f "$t" ] && rm "$f"; done' sh {} +

查看 miniprogram Git 状态：
git -C /Users/yinhuihan/WeChatProjects/foots/miniprogram status --short


十九、后续新需求启动建议

如果下次继续开发，建议先确认：
1. 需求是否影响 Item / ItemSummary / SharedItem 类型。
2. 是否影响本地记录、分享快照、提醒 job 三条数据链。
3. 是否需要修改隐私指引或订阅消息模板。
4. 是否需要新增云函数、集合、索引或触发器。
5. 是否会改变首页快速记录的主流程。
6. 是否会改变分享快照 24 小时失效和内容审核口径。
7. 是否会改变提醒状态 scheduled / unscheduled / sync_failed 的语义。

