# BeatGeo

**Open-source AI visibility monitoring and optimization, by [BeatAPI](https://beatapi.io).**

从真实 AI 回答出发，了解品牌在哪里被提及、哪些页面被引用、哪里需要改进。使用 [BeatBrowser](https://github.com/BeatAPI/beat-browser) 在独立后台工作区采集网页回答，保留证据，明确显示超时与失败。

> **MVP / 开发预览。** 本地浏览器工作台、统一数据库/队列、优化任务与同组复测可运行，已完成一次 PostgreSQL→worker→真实 ChatGPT 验收。网站技术诊断、长期无人值守稳定性和多设备调度仍待完成。没有托管 SaaS、已发布 SDK 或全部平台已稳定支持的承诺。

## Product flow

这是目标产品链路，**不是所有步骤都已实现**。详见 [路线图](docs/roadmap.md) 和 [67 项功能表](docs/product/features.csv)。

```mermaid
flowchart TD
    A[输入网站与业务目标] --> B[确认品牌、受众与竞品]
    B --> C[网站初检]
    B --> D[生成并确认监测问题]
    D --> E[BeatBrowser 后台网页采集]
    C --> F[基线：诊断与实测可见度]
    E --> F
    F --> G[定位页面、事实与引用差距]
    G --> H[生成优化任务与草稿]
    H --> I[人工审核与实施]
    I --> J[同组问题定时复测]
    J --> K[比较变化与报告]
    K --> G
```

[![BeatGeo 产品蓝图：12 个步骤、输入输出和复用模块](docs/product/flow.png)](docs/product/flow.html)

下载仓库后，用浏览器打开 [交互蓝图](docs/product/flow.html)，可点击步骤、切换 BeatAPI / AI 图片业务、查看指标和搜索功能。图中数字为合成示例。

## Quick start

需要 Node.js 24，以及已连接 Chrome 的 [BeatBrowser 1.3.1 源码预览版](https://github.com/BeatAPI/beat-browser)。先登录 ChatGPT / Gemini，运行 `beat-browser doctor --json` 检查连接。

```sh
git clone https://github.com/BeatAPI/BeatGeo.git
cd BeatGeo
node apps/browser-lab/server.mjs
```

打开 **http://127.0.0.1:4318** → 添加采集 → 选择平台和 Chrome 配置 → 输入自己的品牌与客户问题 → 查看原答案、可见来源、状态及导出。

此入口不需要 monorepo 依赖或模型 API key；网站账号自己的订阅和限制仍然适用。任务在独立 TaskSpace 中执行，无法创建时明确报错，不自动改用日常标签页。

源码版 BeatBrowser 可设置 `BEAT_BROWSER_COMMAND=node`，`BEAT_BROWSER_ARGS_JSON` 为包含其 `src/cli.js` 绝对路径的 JSON 数组。`BEAT_BROWSER_PROFILE_ID` 可固定 Chrome 配置。

```sh
node apps/browser-lab/cli.mjs --engine chatgpt --brand Example --prompt 'Which tools would you recommend for this use case?'
node --test apps/browser-lab/*.test.mjs
```

完整产品底座需要 Node.js 24、pnpm 12.4.1 和 PostgreSQL，见 [自托管指南](docs/self-hosting.md)。**SQLite 尚未实现**：当前查询和 pg-boss 依赖 PostgreSQL，不是改一个连接串即可替换。首版保持一套产品账户、数据库与队列；本地 JSON 是采集证据缓存。

## MVP status

| 能力 | 本版状态 |
|---|---|
| 自己的品牌与问题 | 可用；按品牌筛选，多个品牌不混算提及率 |
| 独立后台工作区 | BeatBrowser TaskSpace，复用网站登录，无 Ego 依赖 |
| ChatGPT 网页采集 | 完整 worker 链路真实验收通过，答案/引用入库并安排下一周期；页面变化仍需持续验收 |
| Gemini 网页采集 | 适配器存在，后台长回答稳定性待验证；失败明确呈现 |
| 原回答、来源、导出 | 可用；只读取可见链接，尚未完整展开来源侧栏 |
| 超时与失败 | 单独显示原因、耗时、尝试次数，不当成零曝光 |
| 样本提及率 | 可用；有效分母、版本标识和观察 ID 去重 |
| 竞品声量 | 底座及纯函数可复用，浏览器工作台展示待接通 |
| 账户、品牌、问题、调度 | 一套 PostgreSQL + pg-boss；每次尝试独立记录，成功数据原子提交 |
| 优化行动与复测 | 保存机会和基线 → 记录实施 → 同队列复测 → 匹配比较及缺失数 |
| BeatAPI 研究 | Web Search / Read + 模型分析代码已接入；真实 key 的付费调用待验收 |
| 网站技术审计、推荐识别、SEO 数据 | 待开发/接入；关键词量、外链、排名不冒充已有数据 |

模拟测试不等于真实平台验收。[验收记录](docs/beat-geo/validation.md)

## Measurement

提及率 = **提及品牌的有效回答 / 可评分的有效回答**。超时、未登录、失败和等待不进入分母；相同 observation ID 去重。普通提及不等于推荐，当前账户的样本不等于全市场真实曝光。

例如计划 100 次，80 次有效，其中 24 次提及：提及率 **30%（24/80）**，计划覆盖率另报 **80%（80/100）**。当前工作台统计的是已保存观察的完成覆盖；完整计划覆盖率仍需独立实现。[指标定义](docs/metrics.md)

## One product system

```text
BeatGeo UI / API / MCP
  └─ 品牌、问题、证据、行动与报告 / PostgreSQL
      └─ pg-boss 统一业务队列
          ├─ BeatBrowser：网页观测与引用
          └─ 研究与模型能力：分析、内容和报告
```

当前 bridge 需同机 loopback 和共享 runner token。跨设备租约、离线补跑仍待接通；电脑离线不能声称持续采集。BeatAPI 能力账户与余额由现有网关负责，此仓库不另建钱包。

## BeatAPI integration

研究提供方可选择 BeatAPI：用 Web Search 发现业务与竞品资料，读取页面后生成建议，用文本模型分析已采集的证据。配置服务器端 `BEATAPI_API_KEY` 与可用的 `BEATAPI_RESEARCH_MODEL`；不把 key 放进前端。浏览器采集与基础统计不要求购买模型 API。SEO 专用数据接口尚未接入。

[产品闭环、API 接入位置与商业化设计](docs/beat-geo/beatapi-product-loop.md)。当前为实例管理员统一凭据，不是每租户独立 BYOK 或完整成本账单。

## Privacy and independence

- 没有上游默认遥测项目、广告账号或客服项目；分析服务仅由操作者显式配置启用。
- 产品使用 BeatGeo 品牌，无上游购买入口、客户评价或评分背书。原营销站入口停用，历史商业文案不属于本项目承诺。
- cookies 不导出。证据默认位于 gitignored `.beat-geo/runs/`；没有新目录时可兼容读取已有 `.open-profound/runs/`，不自动搬迁或删除。
- 本地服务只绑定 loopback，校验 Host/Origin 和提交令牌；不要通过公网隧道暴露。
- 密钥兼容旧配置，改名不重置数据库或加密密钥。[隐私与迁移](docs/privacy.md)

## Development

```sh
pnpm install --frozen-lockfile
pnpm lint
pnpm test:browser
pnpm test
```

保留锁文件与供应链保护，不启用归档的上游部署或发布工作流。通过本仓库 PR 维护。

## License and acknowledgements

MIT。见 [LICENSE.md](LICENSE.md)、[第三方声明](THIRD_PARTY_NOTICES.md)。

基于 Elmo 的开源产品基础修改，保留原作者版权和历史。GeoScore、oneglanse、niubigeo、Ansvisor 等为研究及模块评估参考，不代表本版已经复制其全部代码。BeatGeo 与 Profound 无隶属关系。
