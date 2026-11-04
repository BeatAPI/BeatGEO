# GA4：复用已有统计，读取 AI 引荐会话

## 用户流程

当前是本地 CLI 与生成报告：**连接 Google → 同意只读权限 → 选择 GA 属性／站点 → 获取报告**。只有一个可访问属性／站点时自动选中；多个时在终端选择。也可显式传 `--property 123456789 --site example.com`。后续 `ga sync` 复用授权，过期或撤销后需要重连。这是按需读取，没有后台定时任务或网页接入按钮。

不再安装一套采集脚本，不修改 GA 埋点、渠道或事件配置，不引入 Redis、队列或第三方分析数据库。GA 是访客来源参考；服务器／CDN 日志和回答采样分别补充抓取、提及与引用证据。

## 我们的客户端一次配置

产品维护者在**自己的 Google Cloud 项目**启用 Google Analytics Data API、Google Analytics Admin API，配置 OAuth 同意页面，创建 **Desktop app** 客户端并下载客户端 JSON。当前本地项目没有内置已注册的客户端，需通过 `--client-file` 提供。客户端 JSON 留在项目外；不要上传、提交到 Git 或贴到聊天中。

外部用户正式使用前应按 Google 要求完成应用发布／所需验证；测试阶段只有获准测试的用户可以连接。Google 的授权页面必须由用户完成。已登录 GA 网页并不等于产品获得 Data API 授权。未来若迁移成托管 Web 产品，需使用 Web OAuth 回调与已有服务端凭据存储，不能直接把桌面流程搬到公共网页。

本地授权仅请求 `https://www.googleapis.com/auth/analytics.readonly`，使用系统浏览器、随机端口的 `127.0.0.1` 回调、随机 state 和 PKCE。客户端、刷新令牌与选中站点存放在项目外的 `~/.config/beat-geo/ga/<connection>.json`，目录模式 700、文件模式 600；不进入报告或命令输出。当前不使用操作系统钥匙串加密。`BEAT_GEO_GA_HOME` 可改存放目录，但必须位于工作目录外。共享设备应使用各自操作系统账号。

```sh
# 首次：授权、选择站点、读取过去 28 个完整自然日
node bin/beat-geo.mjs ga connect \
  --client-file /private/path/google-desktop-client.json \
  --connection beatapi --property 123456789 --site example.com \
  --out ./runs/ga --lang zh

# 之后按需刷新；默认过去 28 个完整自然日
node bin/beat-geo.mjs ga sync --connection beatapi --out ./runs/ga --lang zh

# 指定范围，首尾日期均包含，按 GA 属性时区
node bin/beat-geo.mjs ga sync --connection beatapi \
  --start-date 2026-09-28 --end-date 2026-10-25 --out ./runs/ga --lang zh

node bin/beat-geo.mjs ga status --connection beatapi
node bin/beat-geo.mjs ga disconnect --connection beatapi
```

不传 `--connection` 时使用 `default`。默认输出目录是 `runs/ga-<connection>`。`disconnect` 仅删除本机连接；如需撤销 Google 侧授权，在 Google 账号第三方连接设置中移除应用。

GA 属性默认网址用于给出站点建议，不保证包含全部域名。`--site` 可以指定该属性实际采集的其他主机名。读取按 **hostName 精确筛选**，不自动合并 `www` 或其他子域名。

## 只取核心数据

- 来源维度：`sessionSource`、`sessionMedium`、`sessionDefaultChannelGroup`。
- 落地页视图额外读取 `landingPage`，不读取查询串。
- 指标仅 `sessions`、`engagedSessions`、`keyEvents`：会话、互动会话、该属性已配置关键事件。
- 筛选为本站 hostname AND（GA 原生 AI Assistant OR 已知来源域名），不依赖用户自定义 AI Traffic 名称。
- 当前域名目录包含 ChatGPT、Gemini、Perplexity、Claude、Copilot、DeepSeek、Grok、豆包、Kimi；只按明确域名及其子域名识别。`deepseekv4.dev`、`gemini3api.com` 等第三方不因品牌字样匹配。原生渠道中尚不在目录的来源保留为 Other AI Assistant。

域名与媒介是 GA 的来源归因，不是不可伪造的身份凭证。未识别别名暂不归入已知平台。Google AI Overviews／AI Mode、来源被剥离、用户未点击、脚本被阻止等情况不能据此还原。GA 排除已知机器人，无法替代爬虫日志。

来源表只在自身粒度汇总会话；落地页视图不再叠加到总览。不累加独立用户数，不将关键事件直接称为订单／购买人数；事件的业务含义和正确性要由站点自己的 GA 配置保证。GA、日志、回答样本之间没有用户级联结，不能画成已经证实的转化漏斗。

读取完整分页，每个视图最多 50,000 行，超过限制或中途失败会报错，不输出成功的截断报表。保留阈值、抽样、高基数合并、数据截断、指标权限限制及空数据原因提示；无记录不证明 AI 流量为零。日期先按属性时区转换成固定 YYYY-MM-DD，快照重放不会随日期移动。

## 输出与离线重放

- `ga.json`：`beat-geo/ga-summary@1`，属性、站点、固定日期、时区、读取时间、平台与来源／落地页、总览和质量提示。
- `ga-input.json`：`beat-geo/ga-export@1`，仅固定列的聚合报告，供离线重放和附加到回答报告；无令牌与客户端凭据。
- `report.html`／`report.md`：沿用已有主题、指标栏、表格和展开依据。HTML 转义导入文本。

导出结构参见 `examples/ga.example.json`：`property.id/name`、`site`、`dates.startDate/endDate`、`fetchedAt`，以及 `sources`、`landing` 两个 Data API 形状的报告。维度、指标列必须与上述固定列及顺序一致，`rowCount` 必须等于完整 `rows.length`。这是本工具的 API 快照格式，**不是任意 GA CSV 的自动解析器**。演示带 `synthetic: true`；真实快照不要伪造这个标记。

```sh
# 离线合成演示，无网络请求
node bin/beat-geo.mjs ga --input examples/ga.example.json --out ./runs/ga-demo --lang zh

# 将已读取的 GA 与已有回答、可选爬虫日志放到同一份报告
node bin/beat-geo.mjs analyze --input ./runs/existing-answers \
  --ga-input ./runs/ga/ga-input.json \
  --crawl-log /path/to/access.log --site example.com \
  --out ./runs/combined --lang zh
```

GA 与日志须为同一 hostname；各自时间范围独立标注，不能默认为同一采样窗口。原始输入与凭据不要放进回答 `records/` 目录。GA 快照含业务统计，分享报告前应按自己的数据权限判断。

## 验收边界

已完成合成数据、OAuth 回调／拒绝／超时、PKCE、授权刷新、权限错误、分页、归类、私有存储、CLI 首次连接模拟和报告测试。此前只读查看过用户自己的 GA 网页；**新客户端的真实 Google 授权与 Data API 查询尚未验收**。未创建 Google Cloud 客户端、未改变外部账号配置、未启用后台同步。

## 官方依据

- [桌面 OAuth 与 PKCE／loopback](https://developers.google.com/identity/protocols/oauth2/native-app)
- [Admin API：列出可访问属性](https://developers.google.com/analytics/devguides/config/admin/v1/rest/v1beta/accountSummaries/list)
- [Data API runReport](https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/properties/runReport)
- [维度与指标](https://developers.google.com/analytics/devguides/reporting/data/v1/api-schema)
- [数据质量元信息](https://developers.google.com/analytics/devguides/reporting/data/v1/rest/v1beta/ResponseMetaData)
- [GA 原生渠道定义](https://support.google.com/analytics/answer/9756891?hl=en)
