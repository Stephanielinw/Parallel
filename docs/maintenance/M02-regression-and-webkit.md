# Parallel Maintenance Mode — M02 跨模块回归与证据分级

**范围**：M01 契约 C-11（日记）、C-17（生命周期）、C-18（WebKit 客户端）。只做必需的日记证据修正与自动测试，不改变原始聊天/见面记录结构、不执行旧存档迁移、不接触任何真实用户 Profile。

## 变更清单

### C-11 · 日记不能把“推演”当“事实”

发现：旧日记模型调用将所有 surveillance slots 统一拼为“全天监控行踪”，包括 `schedule` 和 `meeting_shift` 等预测内容。离线默认日记也会把预测地点写作“上午去了、处理完了”。

现在将来源区分为：

- **observed**：`source === 'meeting'` 的真实见面足迹，`source === 'chat_update'` 的明确聊天状态更新，并排除 `is_planned`、`is_unconfirmed`。
- **projected / unknown**：`source === 'schedule'`、`source === 'meeting_shift'` 以及其他无明确来源的时段；即使日期过去也不自动转为已确认经历。
- **raw meeting evidence**：真实见面档案与末尾原文，可帮助模型避免将旧约会计划当作见面事实。
- **chat statements**：已发的短信是真实通信，但短信里说的未来计划不等于行动已完成。

离线日记仍维持标题、天气、心情、三段文字和亲密度变化，计划只用“原本计划”“尚未确认”等措辞表达。AI 提示也要求严格分开已确认现场、预测行程、见面原文与通信。**本测试检查提示词及合成响应，不是数学上保证每次生成内容都正确**；后续可以引入结构化事实引用、生成后验证。

### C-17 · 完整生命周期回归

`tests/m02-lifecycle.test.cjs` 使用**纯合成数据和无费用模型模拟**贯通：

1. 创建 Profile 并匹配角色；
2. 手机短信、手动进入见面；
3. 见面原文留存及结构化总结失败；
4. 结束后再发短信，不把门禁/楼下等旧短信当当前行动；
5. 见面足迹覆盖过去计划；后续日程为推演；
6. 隔天日记可以引用真实现场，不把推演当事实；
7. 同源应用重新初始化后归档/消息/日记保持；
8. 另一 Profile 不得看到原 Profile 的私密消息。

同时仍保留其他已有专项测试，完整流程测试不能替代单项测试。

### C-18 · WebKit browser smoke（部分覆盖）

`e2e/m02-safari-smoke.spec.ts` 与 `playwright.m02.config.ts` 使用 **Playwright WebKit + 390×844 移动视口 + 触摸模式**，以本地 `vite preview` 加载刚生成的 `dist` 页面，检查：

- 实际构建版本的 `offline.js` 和 `app.js` 在网页中启动；
- 手机上的导航能打开一个真正的消息列表及会话；
- 合成的较长中文/Emoji 存档和历史见面在多次刷新后仍完整；
- 浏览器没有未处理的页面级 JavaScript 错误。

运行环境固定 `ubuntu-24.04`，Playwright `@playwright/test@1.57.0`；CI 安装 WebKit 后运行，并对失败保存报告。

**限制**：WebKit 桌面 Linux 引擎上的手机视口并不等于 iPhone Safari/PWA 真机，尤其不等于 iOS 的持久化配额、进程被系统杀死或 Home Screen PWA 的缓存管理。真机验收需单独检查，不得将 C-18 标记为完全覆盖。

## 运行命令

- `node tests/m02-diary-evidence.test.cjs`
- `node tests/m02-lifecycle.test.cjs`
- `node tests/m01-contract-index.test.cjs`
- 先 `npm run build -- --base=/Parallel/`，再在支持的 Linux 环境运行：
  `npm install --no-save --no-package-lock @playwright/test@1.57.0`；
  `npx playwright install --with-deps webkit`；
  `npx playwright test -c playwright.m02.config.ts`

以上均作为 GitHub Pages 发布前 CI 门禁。所有模型输出均来自测试桩，未调用真实 API。

## 风险与发布边界

- M00 的代码恢复点：`040adb8629782f0ae4b0fbf37f96c04f86b6103b`；`archive/m00-baseline-20261122` 必须保留。
- 修改限定在日记证据层、对应浏览器静态文件镜像、回归测试、文档和 CI。聊天/见面/监控核心实现与用户存档 schema 不变。
- **不自动回写或重新生成用户已经保存的旧日记**。新逻辑只作用于未来新建日记或用户主动刷新。旧条目是否需要手动重新生成由用户自行决定。
- **真实手机备份仍然待用户确认**。GitHub 上的模拟恢复测试不等于备份了手机本地记录，不能据此开始 M03/M04 中带有破坏性的存储迁移。
- 不依赖 Playwright 浏览器测试来验证实际的 AI 文学风格、每一句剧情事实或真实手机的长期存储容量。

## 验收

- [ ] M02 两个 Node 端核心测试在 CI 通过；
- [ ] 原有所有回归测试 + 构建通过；
- [ ] WebKit 真浏览器测试真实启动并通过，不能被静默跳过；
- [ ] M01 契约索引更新：C-11/C-17 为已有测试，C-18 为 WebKit 部分覆盖；
- [ ] 独立 PR 合并且 Pages 正式部署成功；
- [ ] 真实 iOS Safari/PWA 长期持久化仍保留后续人工验收。
