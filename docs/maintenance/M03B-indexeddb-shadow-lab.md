# Parallel Maintenance M03-B — IndexedDB 隔离影子迁移实验

**状态：实验代码，仅在 CI 的一次性 Playwright WebKit 浏览器上下文运行；不是生产迁移。**

## 目标和安全边界

M03-A 已允许用户只读检查导出的备份文件。M03-B 研究把当前浏览器主存档从单一 `localStorage['parallel-portable-v2']` 迁向 IndexedDB 的可行性与事务保证。在**未确认真实 iPhone 两份备份**前，本阶段不可替换应用加载、保存、恢复路径；也不可删除或清空原存档。

此 PR 只增加：

- `tests/fixtures/m03b-shadow-lab.js`：只在自动化测试内注入的迁移候选实现，限定数据库名必须以 `parallel-m03b-lab-` 开头；
- `e2e/m03b-indexeddb-shadow.spec.ts`：WebKit 390×844 / 触屏模式内的完整数据、照片附件、故障和防篡改测试；
- `tests/m03b-shadow-safety.test.cjs`：静态/运行时保护：实验代码不许由正式 app 引入，缺少 IndexedDB 必须明确报错，不能碰 `localStorage.setItem/removeItem`；
- CI 设置，确保这些测试作为 PR 合并与 Pages 发布门禁。

**不会修改：** `public/parallel/offline.js`、`parallel_src/parallel_ai_date/static/offline.js`、`public/parallel/app.js`、`src/App.tsx`、浏览器主存档 key、消息数据结构、真实 iPhone 数据、任何远端账户或服务器。

## 实验数据流

1. 在全新测试浏览器上下文内，用现有 `ParallelOffline.importData()` *仅注入合成数据*：多 Profile/角色可扩展的记录、长篇中文与 Emoji 短信、含稳定 ID 的见面原文、见面记录中的 `entries`、长期记忆中的 `meeting_data`、监控、日记与自定义预设。
2. 用现有 `ParallelOffline.exportData()` 提取当前测试数据的 JSON；单独在这份测试数据里补上一张合成照片数据。**不读取任何真实用户照片。**
3. 实验适配器先记录旧 `localStorage` 主存档原始字符串的 SHA-256，并核对导出 JSON 的 `data` 与当前引擎一致，防止把一份无关或过期导出错当成活跃存档。
4. 对导出 JSON 做**无损按记录切分**：`profiles`、`messages`、`meetings`、`episodicMemories`、`chatPhotoFiles`。保留其余字段、未识别字段和属性顺序于模板中，单条记录作为一行写入独立实验数据库的 `records`，同一事务内向 `control` 写入提交标记、条数和快照摘要。
5. 写入成功后从 IndexedDB 完全重新读取，核对行数、索引完整性、快照 SHA-256、原始 JSON 内容及源 localStorage 哈希是否仍然一致。返回 **shadow copy verified**，并明确原 `localStorage` 仍是权威来源。

**重要：** 这是独立影子副本，不是自动同步的第二个正式存档。实验不存在“迁移开关”，没有任何步骤把引擎读写指向 IDB；不可因为实验通过就认为手机容量问题已经修复。

## 故障注入

- **事务执行中 abort：** 在已经有有效快照的实验数据库上开始第二次写入，强制事务中止，确认第一次完整快照仍可恢复，而旧 `localStorage` 完全不变。
- **事务提交后模拟应用中断：** 写入已成功但调用方未拿到成功响应，随后重新读取并验证已提交的完整数据。此模拟覆盖“提交完成后确认丢失”的基本情形；**不模拟 iOS 设备突然断电、Safari 被系统回收或文件系统级崩溃**。
- **原始存档更新：** 旧影子副本的哈希不同于最新 localStorage 时，必须报告 `stale`，不能把旧副本当成最新数据。
- **IDB 行被改写：** 快照 SHA-256 应失败并拒绝将其标记为可读取的完整副本。
- **缺少 IndexedDB / 无效数据库名：** 明确失败，绝不能清空或改变原有存档。

## 尚未通过的正式上线条件

1. **真实用户备份：** 必须由用户确认 iPhone 的 JSON 完整备份已经独立保存两份，并完成 M03-A 校验。此实验不代劳。
2. **原始数据无损：** 本实验分区的是 `exportData()` 生成的备份 JSON。该接口会清除 API Key、独立生成日志和部分原浏览器底层存储细节，因此**本实验不能证明直接迁移原始 localStorage 的每个字段都字节级一致**。正式迁移必须将密钥管理、独立照片库与完整原始值读取做成明确的独立契约。
3. **照片写入一致性：** 实验照片使用测试用数据，尚未原位迁移生产 IndexedDB 照片库或验证与主事务的跨数据库原子性（IndexedDB 不支持跨数据库的单事务原子提交）。
4. **多标签/多设备竞争：** 还没有实现跨标签页锁、序列化写入、写前后版本比较、异步持久化失败的用户提示。
5. **容量/性能：** 事务 abort 是可控的故障注入，**不等于 Safari 真正触发 QuotaExceededError 的实测**。仍需要在合成容量压力下验证写入放大、内存峰值和后台刷新。
6. **减少重复内容：** 这次只实现记录级分区，不删除见面 `entries`、记忆中的 `meeting_data` 或其他重复字段；未来去重必须用来源 ID 索引并提供相容回放，不能轻易删除原文。
7. **生产灰度开关及回滚：** 后续需在独立 PR 中设计“复制→校验→可恢复→显式启用新读取→逐项小流量验证”，而不是直接覆盖旧存档；原始 `localStorage` 删除必须成为**远期明确确认后的单独动作**。

M00 恢复基线 `040adb8629782f0ae4b0fbf37f96c04f86b6103b` 与分支 `archive/m00-baseline-20261122` 均保留。M03-B 不会改变生产应用行为。
