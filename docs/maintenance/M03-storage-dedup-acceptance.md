# Parallel Maintenance M03 · 存档去重与存储安全收尾

**本补丁解决的是新产生的见面记忆重复写入，不是 M04 的 IndexedDB 增量存储。**

## 审计结果

当前浏览器主存档仍为 `localStorage['parallel-portable-v2']`，可能通过 `PARALLEL-LZW14-V1:` 无损压缩；真实聊天照片独立保存在 `parallel-chat-photos-v1`。既有存档里的同一场见面原文，可能同时存在于：

1. `messages[]`：原始消息、消息 ID 和恢复/删除来源；
2. `meetings[].entries[]`：用户打开见面卡片所需的完整归档原文；
3. `episodicMemories[].meeting_data`：此前每次生成见面记忆时，复制的整份 `meetings` 记录。

这三处并非都可安全直接删掉：`messages` 与 `meetings.entries` 分别承担业务读写与完整归档职责，不能在 M03 未准备好逐字段回填与验收之前删除。重复的第三份 `meeting_data` 才是第一处可逐步停止新增的冗余记录。

## 本次最小行为变更

- **只对新生成的 `meeting_summary` 记忆**：仍保存稳定的 `meeting_id`、`raw_msg_ids`、时间、摘要、纠错/标签等，但不再嵌入第二份整场 `meeting_data`。完整 `meetings[].entries[]` 与 `messages[]` **原文不删不改**。
- **读取 /memories 时**：仅针对同 Profile、同角色且找到对应 `meetings[]` 的见面记忆，在返回给 UI 的对象中临时附上 `meeting_data`；不将这个展开结果写回 localStorage。见面卡片、历史文本和现有记忆页面仍然能读取相同的完整记录。
- **既有旧存档**：已嵌入的 `meeting_data` 一律保留，不在页面加载、自动更新、导出或备份时暗中剔除。如果对应原始 `meetings[]` 不存在，旧快照仍可能用于既有兼容读取；不额外制作假的见面来源。
- **永久删除**：继续走原来的 `forgetMessages` / `meeting-forget` 清理；`meeting_id` 引用不得让旧原文在用户明确删除后重新出现。
- **备份**：旧版完整内嵌记忆仍可原样导入/导出；新版本备份保留主见面记录和引用，重新导入后可以解析引用。未修改导出格式版本。
- **双源文件**：保持 `public/parallel/offline.js` 与 `parallel_src/parallel_ai_date/static/offline.js` 完全同步。

## 验收

`tests/m03-meeting-memory-reference.test.cjs` 覆盖新生成记录中没有重复全文、UI 按 ID 展开原文、重启与备份恢复、旧完整快照不被静默改写、用户明确永久删除后不得复活原文。现有 M00–M03-D 所有测试、WebKit 与发布门禁仍必须通过。

## 本阶段绝不做的事情

- 不主动扫描或清理用户手机里已有的重复 `meeting_data`；老存档无损优先于容量节省。
- 不把 `messages` 或 `meetings.entries` 替换成无法独立恢复的引用；不改变照片的存储与引用策略。
- 不启动生产 IndexedDB 迁移，不自动清空旧 `localStorage`，不改变 API 密钥位置。
- 不以 Linux WebKit 代替真实 iOS Safari 空间压力测试。M03-A 所需两份独立真实备份的用户操作仍尚未确认。

## 与原定路线图的界线

M03：已有备份只读核验和模拟影子/故障/回滚测试；现在额外停止**新**见面记忆的冗余全文复制。用户历史数据原样保留，因此不能宣称旧存档体积已经缩减，也不能声称手机容量限制已解除。

M04：后续的 **IndexedDB 增量存储** 才负责正式存储架构；必须通过真机备份、写入序列化、照片一致性和回滚等独立安全门槛。M05 则是原计划的 **统一事件时间线**，不能与本补丁混为一谈。
