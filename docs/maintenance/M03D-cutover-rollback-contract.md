# Parallel Maintenance M03-D — 切换与回滚的隔离预演

**状态：测试专用事务路由预演，不能用于正式 Parallel 存档切换。** 不改生产读取/保存路径，不迁移真实 iPhone 数据，不删除 `localStorage` 或照片，也不要求用户输入真实存档。

## 为什么不直接上线

当前正式主存档在 `localStorage['parallel-portable-v2']`，聊天照片在另一个 IndexedDB（`parallel-chat-photos-v1/photos`）。M03-B/C 只证明合成数据在独立实验库的复制、核验、故障拒绝，以及局部标签页竞态检查，**没有**全局写锁、跨库原子事务或真机空间/崩溃证明。实验的 `exportData()` 也会移除 API 密钥和独立日志，不能当成原始存档的字节级无损迁移。

本轮新增 `tests/fixtures/m03d-cutover-rehearsal.js`，只在 Playwright 的一次性浏览器上下文手动注入。它创建名称为 `parallel-m03d-lab-<128-bit random hex>` 的**独立实验控制库**；仅写该库中的 `routes/active` 元数据。正式应用不知道这个指针的存在，仍然只从原来的 localStorage 读写。影子备份仍由 M03-B/C 的独立 `parallel-m03b-lab-m03c-...` 数据库提供。

## 状态机与不变量

| 测试路由 | 含义 | 可进行的动作 |
|---|---|---|
| `legacy, revision 0` | 新测试控制库，没有写过任何路由 | 完整验证影子候选后尝试 `switchToShadow` |
| `shadow, revision N` | **仅在测试 reader 内**优先从指定 IDB 副本读取 | 每次读前重验 source SHA / shadow digest / 照片；可 `rollback` |
| `legacy, revision N+1` | 实验回滚，丢弃实验读指针 | 再次验证候选可重新预演，不影响真实存档 |

- 切换或回滚前必须提供 `expectedRevision`。通过控制库 `routes` 的**单个 IndexedDB readwrite 事务**检查旧版本并提交新版本。两个标签页持有相同旧 revision 时最多一个成功，另一个显式收到 `revision conflict`，绝不静默覆盖实验指针。
- **只接受已通过 M03-C 验证的随机影子副本。** 核验旧 localStorage 的 SHA-256、影子 manifest、分区记录完整性和来源照片库；绝不读取任何 `parallel-production-*` 数据库。
- 影子“读切换”只改变实验 reader 的返回来源，**不替换正式 App 的 read/write adapter，不更新 legacy key、不移动 API 密钥、不增删照片**。
- 每次实验读取都重验影子数据完整性；读取异步返回前再检查路由 revision 未被其他标签页更新。摘要、来源或照片不匹配时**拒绝返回影子记录**；不能自动把坏副本标为完整数据。
- 预演回滚只将实验指针恢复 `legacy`。不会删除影子数据库，更不会删除源 localStorage/照片。回滚不会尝试从损坏的影子恢复原文；原始源始终被保留为权威副本。
- 提供 `after-pointer-commit` 故障注入：模拟事务已经提交但调用方没收到确认。刷新测试页后仍可检查提交路由及候选，然后手动回滚。
- 旧源更改会让此前的影子指针过时；已上锁的候选损坏或原照片发生变化时，预演 reader fail-closed，显式回滚后再读取旧存档。

## WebKit 测试与安全检查

- `e2e/m03d-cutover-rollback.spec.ts`：切换→完整内容读取→刷新恢复→显式回滚；两标签 CAS 冲突；提交成功但确认丢失；影子记录篡改；真实来源照片差异；旧源更新后影子拒读。全部使用合成消息、中文/Emoji、见面 entries、meeting_data、日记、监控和 JPEG 测试片段。
- `tests/m03d-cutover-safety.test.cjs`：禁止生产入口导入，禁止该脚本使用 `localStorage.setItem/removeItem`、`indexedDB.deleteDatabase` 或恢复覆盖 API；缺少 IDB 时拒绝打开/创建任何生产数据库。
- 新测试接入原有 CI / WebKit 门禁，M00/M01/M02/M03-A/B/C 的回归必须继续通过。

## 设计与证据界限

这不是“灰度上线”或真正的切换按钮；只是在测试浏览器中预演切换原子性。它无法在 **localStorage 与影子 IDB、照片 IDB 之间**创建统一事务，也不提供生产浏览器间跨进程锁。指针提交与源存档变化之间依然可能存在竞态；测试中的二次验算可以发现一些错误，但**不能消除**真正的写冲突。真实 iPhone Safari/PWA 后台杀进程、QuotaExceededError、存储清理也没有在本轮得到真机证实。

### 正式迁移必须另外经过的门禁

1. 用户在 iPhone 上实际导出一次完整存档，在**两个独立安全位置**保留相同内容，并用 M03-A 核验；用户明确允许尝试迁移后才可进入正式实施。
2. 针对**原始**存档而非脱敏 `exportData()` 制定数据契约：包括 API 密钥本地处置、独立日志/照片、字段顺序与未知字段、导入/回滚策略、版本兼容。
3. 设计跨标签锁/epoch/通知及老页面读写拦截，确保不能覆盖更新版本；明确写入故障、空间不足、进程中断后的 UI 反馈和恢复路径。
4. 为照片和消息两个存储位置规定“准备→校验→标记→恢复”的可重试协议及孤儿/半提交处理；不能假装 IndexedDB 能跨库原子提交。
5. 在真实 iOS Safari/PWA 上用**合成数据**验证大存档、真实配额和后台中断；再进行有限灰度和经过用户明确确认的切换。旧主存档清理须另行批准。
6. M00 保留 `archive/m00-baseline-20261122` 作为**代码**恢复点，不能替代真实 iPhone 数据备份。

**结论：** 本阶段即使测试全部通过，也仅证明“切换/回滚状态机设计在受控 WebKit 环境中的行为”，不能据此启用正式迁移。
