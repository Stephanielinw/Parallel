# Parallel Maintenance M04 · IndexedDB 增量存储

> **原始维护路线图 M04，未新增子关卡编号。** 本次实现可复用的 IndexedDB 增量存储核心，但默认禁用正式接管。M03 去重/存档安全已经先行完成测试及新记忆引用的最小改进。M05 仍为「统一事件时间线」，不在这个 PR 内。

## 背景与目标

当前运行中的 Parallel 离线引擎对几乎每次修改都会执行 `JSON.stringify(db)`，再将所有聊天、见面、记忆、日记、监控和设置写入一个 `localStorage['parallel-portable-v2']` 字符串。虽然现有 LZW14 压缩能缓解容量压力，但增量修改的成本仍随存档体积增加，并承受 localStorage 额度与同步写入限制。

M03-A～D 已验证合成快照、跨标签竞争、照片来源和回滚预演。**它们没有批准真实 iPhone 存档迁移。**

本 PR 新增 `src/storage/parallelIncrementalIDB.js`，一个**可复用、默认未接入 app 的增量记录存储实现**。只在 CI 的一次性 Playwright WebKit 中通过脚本注入。数据库名**强制**为 `parallel-m04-lab-<随机 128-bit hex>`；不能打开正式主存档数据库，不读写既有 localStorage，不碰照片库，不删除旧存档。

## 结构与原始数据保真

一个独立 IndexedDB 数据库有四个 object stores：

| 存储区 | 主键 | 用途 |
|---|---|---|
| `meta` | `head` | schema v1、revision、原始来源 SHA-256、初始快照 SHA-256、字段顺序、各集合条数 |
| `records` | `[collection, id]` | 按稳定记录 ID 单条保存；每条记录独立 SHA-256 |
| `orders` | `collection` | 每个集合的原始 ID 顺序及轻量顺序校验，避免多条记录重组错位 |
| `root` | 原顶层字段名 | 独立保存 `relations`、`diaries`、`surveillance`、`connection`、未知自定义字段等其他值，每项 SHA-256 |

拆分数组包括 `profiles`、`messages`、`meetings`、`meetingCheckpoints`、`episodicMemories`、`events`、`presets`。其他顶层字段按独立 key 保存，保留未知字段的值与原有键顺序。重复 ID、没有稳定 ID 的记录以及结构缺陷会**明确拒绝**，绝不自动删除或猜测如何合并。

这是原始 **JSON 快照数据结构**的增量存储实验，不是对原始 localStorage 字节的迁移。实验可接收现有 `exportData()` 的脱敏合成快照，因此不验证 API 密钥原位迁移、日志内容或所有存储元数据。

## 增量 API 与行为

- `initialize({snapshot, sourceSha256})`：仅新建实验库时写入一次初始快照；如果已有已提交 head，拒绝覆盖。写入记录、根字段、顺序和 head 在**同一个 IndexedDB readwrite 事务**内完成。容量故障中途 abort 不会产生合法部分快照。
- `applyBatch({expectedRevision,changes})`：一次事务写入变化的记录或顶层字段。支持 `put`（新建或更新按 ID）、`delete`（必须存在）、`set-root`（仅已存在的非记录顶层字段）。仅当新增/删除记录时重写该集合的 ID 顺序；**更新一条消息不重写整段历史聊天**。
- `readRecord(collection,id)`：按 ID 读取单条记录及其 revision，并验算该行 SHA-256。
- `readHead()`：只读版本/来源元信息。
- `load()`：重新读取、核对每行的完整性、数量、ID 顺序、额外/缺失行与未知字段后重组完整 JSON，用于重新打开或恢复。初始 revision 验证整个初始快照的 SHA-256；后续 revision 依赖逐行/根字段哈希与集合顺序一致性。

**所有变更使用预期 revision 比对（CAS）并在同一 IDB readwrite 事务中提交。** 两个标签页持有相同旧 revision 时最多一个成功，另一个返回 `revision conflict`，必须重新读取和重算改动，不能覆盖别人。

结果里有本次 `recordWrites`、`recordDeletes`、`rootWrites` 与 `orderWrites`，能够明确核查本次只重写了哪些项，不把增量保存偷换成另一种完整复制。

## 回归与故障演练

`e2e/m04-incremental-idb.spec.ts` 使用实际 WebKit（非 iPhone 真机）与合成 Profile/多条中文 Emoji 消息/一场完整见面/记忆内嵌历史记录/日记/监控/未知字段/合成 JPEG 测试附件验证：

1. 初始化无损往返；只改一条消息、追加一条并改日记，必须只写两条消息和一个根字段，未触及原始 `localStorage`；刷新后记录仍能按原顺序完整恢复。
2. 两标签同时基于 revision 1 写入，恰好一个提交、一个冲突；冲突方读取新版本后再重试。
3. 模拟 QuotaExceededError abort：前一个完整版本未损坏；模拟事务成功但确认丢失：刷新后能找回已提交 revision；手动篡改一行：SHA-256 检查必须拒绝读取。
4. 重复 ID、重复初始化、不存在的记录删除必须失败，且仍可读取最后一次完整提交。
5. 含真实照片引用的合成消息保留其 `photo_ref` 字段；现有照片 IndexedDB 不因增量记录更新而改变。**两个数据库不存在统一原子事务。**

`tests/m04-incremental-safety.test.cjs` 确保此候选没有出现在生产入口，不访问 `localStorage`/照片库/生产数据库，不执行自动删除，且缺少 IDB 时明确失败。所有旧回归、M03 WebKit 测试与 GitHub Pages 门禁继续保留。

## 尚未完成/禁止的正式接管工作

这个 PR 完成的是**可复用的数据层核心及浏览器证明**，**不是**将 Parallel 正式存档切到 IndexedDB。正式 M04 接管仍有以下安全阻塞：

1. **真实 iPhone 双备份**：必须先用「导出完整存档 JSON」保存同一文件到两个独立可靠位置、完成 M03-A 哈希/结构核验，且用户批准迁移。M00 代码分支不是手机资料备份。
2. **同步引擎适配**：目前大量业务调用同步 `save()`。需要在正式接入前重构为可靠的异步提交/用户反馈机制，不得在未持久化时提前向 UI 宣称成功。任何老标签页仍可能通过 `localStorage` 覆盖新数据。
3. **业务关联批处理**：增量存储核心不懂业务领域；永久删除见面消息时，必须同一业务批次更新或删除相关 `messages`、`meetings`、记忆引用、日记/监控等。不能单独删除一行就把它误认为安全忘记原文。
4. **原始存档字段与密钥**：要另行明确完整原始值、凭据和日志的保存与回滚合同；测试的脱敏 `exportData()` 不等于原始字节级迁移。
5. **照片跨库一致性**：需要对主存档消息 `photo_ref` 与现有照片 IDB 进行显式的可重试准备/校验/回滚协议；不能让新存储变成只有照片引用但没有照片内容的副本。
6. **真实 iOS 压力/系统回收**：Linux WebKit 测试并不能替代 iPhone Safari/PWA 后台中断、真实配额不足、浏览器回收与长期并发实测。
7. **正式灰度与回滚**：不能使用这个实验数据库名限制的候选去偷偷创建正式存档。必须独立审核激活开关及升级/降级机制，明确可逆并保留旧存档；删除旧 key 需要未来的单独授权。

**进度结论：** M04 的增量引擎与回归可以被验收为「数据层技术实现通过」，但整个 M04 若以“正式替代 localStorage，降低实际手机容量压力”为验收目标，当前仍是**待正式接入，不得标记全完成**。当前真实用户数据没有被访问或修改。
