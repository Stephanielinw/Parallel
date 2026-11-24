# Parallel Maintenance M08 · 多版本逻辑分叉治理

> 严格以 M07 + PR #43 的 `main` 为基线。此轮只处理发布版本的**共享源码、运行入口及关键 API 兼容**，不做游戏逻辑重构、不交换浏览器和 SQLite 存档、不启用 M04 的实验性 IDB 切换，不提前启动 M09。

## 实际审计：三个发行入口，不是三份等价存档

| 入口 | 前端逻辑来源 | 数据/模型后端 | 本轮权威 |
|---|---|---|---|
| GitHub Pages（Vite + React shell） | `public/parallel/app.js` | `public/parallel/offline.js`、浏览器本地存储 | 浏览器引擎 `offline_modules/*.js` |
| 单文件直开版 | `parallel_src/parallel_ai_date/static/app.js` 内嵌 | 同一份编译后的 `offline.js`、其当前浏览器存储源 | 相同浏览器引擎 |
| Python 本地服务 | 同一份 `static/app.js` | `server.py` + 独立 SQLite 文件 | 保留兼容实现，不跨载体自动迁移 |

三个入口**视觉 UI 可以对齐，但数据不共享**：单 HTML 的 `file://`、GitHub Pages origin、本地 Python SQLite 数据库绝不可视为同一个存档。该区别原本存在，M08 不引入也不掩盖它。严禁通过“切换版本”直接清除或覆写任意现有存档。

## 1. 消除前端双编辑源

- **唯一可修改的经典前端**：`parallel_src/parallel_ai_date/static/app.js`、`style.css`、`index.html`；
- 对应 `public/parallel/` 三个文件是逐字节的构建镜像，禁止直接改动；
- `scripts/assemble-frontend.cjs --check` 只读比对三项资源；`--write` 显式生成镜像；
- `npm run build:downloads` 同时执行 M06 engine 及 M08 frontend 检查，任何一份产物漂移即拒绝发布；
- `src/App.tsx` 是 Pages 使用的 React **外壳**，不是复制出来的应用业务逻辑；M08 测试检查其关键 DOM 锚点与经典 shell 兼容，不把 JSX 或 Python HTML 改写成另一种运行时。

与 M06 一样，离线引擎的唯一源码仍是 `offline_modules/*.js`，两份 `offline.js` 继续由原 `assemble-offline.cjs` 生成。单文件版仍通过 `build_portable.cjs` 原样内嵌相同 JS/CSS；没有引入 `file://` 下不兼容的 ES module、外部 CDN 或新的持久化键。

## 2. 关键业务路由不再静默分叉

审计时，浏览器与 Python 有 43 个重合路由，浏览器多出 6 个，尤其 `meeting-summary-save` 在 Python 中缺失；Python 的 `meeting-summary-refresh` 还只有旧 GET 分支，Pages UI 实际提交的是 POST。

本轮对齐：

- Python 新增 `POST /api/meeting-summary-save`，验证 Profile–角色–会议 ID、原始见面消息、6–4000 字限制；不调用 LLM；保存完整手动总结并同步该场记忆索引；
- Python 的 `POST /api/meeting-summary-refresh` 与旧 GET 统一调用同一处理函数；未经确认不得覆写手动总结，生成过程中再次确认原文和手动修改版本；
- SQLite `meetings` 新增 `summary_source`、`summary_edited_at` **两个带默认空值的兼容字段**。旧库仅采用 `ALTER TABLE ADD COLUMN`，不搬迁、删除或重建用户数据；
- 重新打开原见面且追加剧情后，旧手动总结失效；原文被修改后不得继续当成完结小结；Python 重启时的清洗逻辑也必须保留手动文字；
- 不将故事梗概升级为原文事实证据：角色的真实对话、已发生动作仍以原始 messages/meeting entries 为优先来源。

**CI 版本新旧隔离**：同一个 PR 提交更新后，旧版构建立即取消，避免把过时的测试结果误当作最新版本验收；正式 main/Pages 发布继续保留串行执行，绝不取消已经开始的主分支部署。

**WebKit 环境稳定性**：2026-11-23 的 PR 检查在 Ubuntu `us-east-2.ec2.archive.ubuntu.com` 系统包下载中触发 12 分钟超时，浏览器测试尚未开始。M08 改为使用 Microsoft 官方 `mcr.microsoft.com/playwright:v1.57.0-noble` 预装 WebKit 容器执行同一套实际 WebKit 测试；NPM 端测试依赖仍固定 `@playwright/test@1.57.0`，不变更用户实际运行环境、不跳过测试。这不是 iPhone 真机测试。

**明示的浏览器独有路由**：`discover-session`、`discover-progress`、`episode-archive-tick`、`chat-photos`、`chat-photo-read`。这些依赖浏览器端状态、照片存储或自动归档队列，本轮不会在 SQLite 伪造兼容行为。路由列表由 `tests/m08-version-parity.test.cjs` 精确检查：除这五项外，任何新增只在一个后端的 API 名称都应导致 CI 失败，直到明确实现或审查例外。

路由名称一致**不代表全部 44 个业务逻辑已经数学等价**。双方独立执行环境在调度、IDB 照片、自动归档和故障恢复上仍有实现差异；应对具体差异用共享回归场景逐步核验，而不能冒险把旧 SQLite 存档改成浏览器存档。

## 3. 验证门槛、保护边界与回滚

1. `node tests/m08-version-parity.test.cjs`：镜像逐字节一致、故意注入漂移必须被拒绝，Pages / Python shell 关键 DOM 锚点存在，路由清单与例外严格匹配；
2. `python3 -m unittest parallel_src/parallel_ai_date/tests/test_api.py`：隔离临时数据库中，验证 Python 手动粘贴超过 850 字可原样保存、跨 Profile/角色越权被拒绝、空摘要不能覆盖、AI 未确认不可覆写、刷新线程不损失手动小结、原文修改使旧总结失效；
3. `npm run build -- --base=/Parallel/` 后运行 `node tests/m08-release-output.test.cjs`，逐字节对比真实生成的 Pages 文件、两份可直开的完整 HTML 与当前 canonical JS/CSS；不得只检查构建脚本的字符串；
4. M00–M07 全量既有测试，以及移动视口 WebKit 回归和正式构建必须继续通过；
5. 合并前确认目标基线仍为 PR #43 后的 `main`，无旁支混入；合并后核验 Pages CI/部署.

**回滚**：若新功能失败，可回退 M08 提交，三份共享前端仍由 M07 产物提供；SQLite 新增的两列无需删除，旧代码可读取旧字段，但**旧 Python 版本一旦再次重写该场 meetings 行，可能将新列恢复默认值并丢失手动来源标记**。回退 Python 后不要直接对含新手动总结的旧库写入，先做无损 SQLite 文件备份并验证，再按需恢复 M08 兼容版本。无破坏性回滚脚本；严禁删除列或重建真实用户数据库。真实手机数据、API 密钥、照片文件均未在测试中访问。

## 本轮不宣称完成的事项

- 不宣称 Pages、单文件版、Python 共享同一组用户数据或全部业务行为；
- 不改 M05 的用户事实高于监控/生成推断规则，不改聊天/见面 Prompt；
- 不将 Python SQLite 迁移到 localStorage，不进行云存档或登录同步；
- 不让修改后自动发布，最终仍以本 PR 的完整 CI 和 GitHub Pages 结果验收。

M08 的目标是让**分叉可见、共享源码不再漂移、当前已知的关键功能缺口被补齐**，为 M09 发布与云备份准备提供可验证基线。
