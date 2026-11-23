# Parallel Maintenance M06 · 拆分 `offline.js` 业务模块

> 原始路线图 M06（第三阶段：架构模块化）。**只重排源码组织，不改变游戏逻辑与既有存档。** 不引入 M06-A/B 等新阶段，也不提前进行 M07 前端状态与交互、M08 多版本逻辑分叉的业务改造。

## 为什么没有直接改为运行时 ES modules？

截至 M05，`public/parallel/offline.js`（约 5,972 行 / 355,291 个 JS 字符）及 `parallel_src/parallel_ai_date/static/offline.js` 是两份逐字节一致的发布镜像。它们有一个共享词法作用域（IIFE）；VM 单元测试直接执行单文件；GitHub Pages、单文件直开版和部分 Python 项目打包流程均依赖这个入口。

直接转换为浏览器 `import` / 拆成 10+ 个 `<script>` 会改变加载顺序、Safari 本地 `file://` 行为以及单 HTML 版的离线兼容性。如果为了“拆文件”而改成运行时模块加载，反而可能重新制造我们从 M00 开始防范的连锁故障。

所以 M06 采用**构建时按业务责任拼接的 source modules**：

- **唯一可维护源码**：`parallel_src/parallel_ai_date/offline_modules/*.js`，共 14 个按依赖顺序排列的业务分区；
- **编译器**：`scripts/assemble-offline.cjs`，按明确清单原样拼接、检查语法；
- **兼容发布产物**：`public/parallel/offline.js` 及 `parallel_src/parallel_ai_date/static/offline.js`，两个必须**逐字节**与拼接结果一致；
- **旧执行语义**：仍然单个 IIFE、单个 `window.ParallelOffline` 接口，不增加浏览器导入、网络请求或全局变量，也不修改任何 localStorage/IndexedDB 数据格式。

**重要限定：** 这些是独立维护的**源文件分区**，不是已完成依赖注入的独立 ESM 服务。跨领域共享的局部变量和函数仍在最终 IIFE 中，因此此阶段没有宣称所有依赖都已解耦。后续调整依赖边界需要独立行为变更及回归，不在本轮冒进。

## 模块职责与边界

| 源模块 | 职责 |
|---|---|
| `01-engine-bootstrap.js` | 配置、预设默认值、角色目录、基本身份/任务设置与初始状态 |
| `02-storage-codec.js` | 主存档 LZW14 无损压缩/解压缩 |
| `03-message-normalization.js` | 模型协议头清洗、错误气泡识别与存档规范化 |
| `04-persistence-presets.js` | 主存档迁移兼容、日志数据库、预设校验/设置 |
| `05-chat-media-queue.js` | 图片引用、翻译、短信气泡、队列/请求协调 |
| `06-episodic-memory.js` | 情节记忆、原文关联、纠正记录 |
| `07-surveillance-diary.js` | 监控、事件日程、角色日记及独处活动推演 |
| `08-meeting-scenes.js` | 现场地点、移动、候场、见面记录、永久删除和归档兼容 |
| `09-episode-archive-recall.js` | 自动情节归档、来源证据核验与记忆检索 |
| `10-meeting-checkpoints.js` | 超长见面记录分段 checkpoint 与验证 |
| `11-prompt-context.js` | 消息窗口、时间线、人物状态及四层记忆 Prompt |
| `12-model-gateway.js` | 接口请求、错误分类、日志与模型调用 |
| `13-discovery-replies.js` | 角色发现、首句、聊天和主动消息等生成流程 |
| `14-request-router.js` | 原有 /API 兼容路由与导入导出、对外 `ParallelOffline` 接口 |

这种分区严格保留每个原始字节的相对顺序。旧文件没有“改写后的等价代码”，而是其源代码本身的无损重新组合；生成输出在提交时**仍与 M05 最终版本完全一致**。

## 开发与发布命令

在完整 GitHub 仓库根目录：

```bash
# 检查两份离线镜像、模块拼接与语法；不改任何文件
node scripts/assemble-offline.cjs --check

# 修改 offline_modules/*.js 后，显式重建两份生成产物
node scripts/assemble-offline.cjs --write

# 验证模块一致性、故意注入的漂移是否被拦截及旧 API / 备份结构
node tests/m06-module-assembly.test.cjs

# 生产构建首先 --check，漂移时拒绝输出发布包
npm run build -- --base=/Parallel/
```

`npm run build:downloads` 已自动把 `--check` 作为第一步。它会先核对源模块，再继续制作单 HTML 和 zip。测试既验证两份镜像完全一致，也向一个模块虚拟注入“未重新生成”的改动并验证 **drift rejection**，无须篡改真实文件。

## 验收边界与风险

- **代码检查**：拼接结果和 M05 `offline.js` 字节完全相同；保留旧单文件语法、首尾入口及公开函数。
- **行为回归**：重新执行全部 M00–M05 测试，包括旧存档导入/导出、Carlos 未赴约事件优先级、M05 防假记忆、跨 Profile 隔离、永不误删见面、照片、M04 非生产 IDB 实验。
- **浏览器兼容**：继续执行 WebKit 移动端尺寸套件与首页启动验证。这个不是实际 iPhone Safari 真机覆盖，M02 C-18 仍为部分覆盖。
- **发布验证**：CI + Pages 部署均成功才合并结案。
- **不涉及的数据**：真实 iPhone 存档、legacy localStorage key、聊天照片 IDB、M04 增量引擎状态、第三方 API 连接字段完全未迁移、未清理、未覆盖。
- **后续残余风险**：业务模块之间仍存在共享变量和调用依赖；本 PR 只建立清晰修改入口及自动对齐机制，不能宣称所有循环依赖或性能问题已经根除。M07 和 M08 有各自原计划的职责，届时仍须独立验收。

## 维护纪律

以后修改离线引擎：
1. 只在 `offline_modules/` 中修改对应业务源文件（多模块修改需要说明数据依赖）；
2. 显式 `--write` 同步两份打包文件；
3. `--check` + M00–M06 回归全部通过再合并；
4. 不直接手工改生成的两份 `offline.js`。如果临时热修产物，也必须回填源模块并验收一致；
5. M05 的事件事实优先级和记忆原文核验规则严禁为重构“方便”而恢复监控统治剧情。

**结论**：M06 是源码组织与单源构建制度的改造，不是运行时加载方式改造；若完整 CI 通过，可标记“业务源文件拆分与防漂移门禁完成”，但不应误称全系统低耦合或已有真实 iOS 存档迁移。
