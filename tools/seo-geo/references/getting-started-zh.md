# 站点数据接入：怎么开始

优先复用已经安装的 GA：**连接 Google → 选择 GA 属性／站点 → 读取 AI 来访报告。** 首次需用户在 Google 页面同意只读访问，后续 `ga sync` 复用授权按需读取。我们自己的 Google 客户端需一次配置；当前实现是本地 CLI，还没有网页里的“一键连接”按钮。见 [GA 接入说明](ga.md)。

```sh
node bin/beat-geo.mjs ga connect --client-file /private/path/google-desktop-client.json \
  --out ./runs/ga --lang zh
node bin/beat-geo.mjs ga sync --out ./runs/ga --lang zh
```

GA 报告包括平台、来源／媒介、会话、互动会话、落地页与已配置关键事件；不要求再安装采集脚本。没有 GA 的网站仍需要先安装并产生数据，不能仅凭网址取得历史流量。

## 爬虫抓取观察

当前用法是：**填写站点网址或域名 → 提供本站访问日志 → 生成分来源的抓取报告。**

只有网址，无法获知谁访问过网站。当前工作区提供命令行和报告，没有网站接入表单或自动日志连接；首次需要从本站服务器／CDN 导出访问日志，或请站点负责人提供。后续仍通过导入新日志更新报告，不会自动实时刷新。

## 三步使用

1. 确认站点，例如 `https://example.com/` 或 `example.com`。这里填写站点根地址，子域名分别处理。
2. 准备本站访问日志：支持标准 Nginx／Apache Combined、本工具定义的 JSON 或 JSONL。其他 CDN 字段格式需要先转换，不能假定任意导出都兼容。日志需包含请求时间、路径、方法、状态码和 UA；共享多站点日志需要可靠的主机字段。
3. 运行导入命令，打开输出的 `report.html`。输出目录与原始日志分开。

```sh
node bin/beat-geo.mjs crawls --site https://example.com/ \
  --input /path/to/access.log --out ./runs/crawls --lang zh
```

报告展示平台、用途、身份声明、访问页面、最近时间、响应状态，以及可展开的请求证据。支持 OpenAI、Anthropic、Perplexity、Kimi 的 11 种内置声明；搜索、训练和用户触发用途分开标注，不代表覆盖全部 AI Agent。身份当前按 UA 声明匹配，尚未做 IP／DNS 核验。

## 区分三类结果

| 想知道什么 | 需要的数据 | 当前状态 |
| --- | --- | --- |
| 哪个 AI 爬虫声明访问过本站 | 本站服务器／CDN 访问日志 | 已支持离线导入分析 |
| 用户从哪个 AI 搜索点击进入本站 | 已有 GA 的来源归因／会话数据 | 已实现只读连接与报告，待真实 OAuth／Data API 验收 |
| 哪些 AI 回答提到或引用了我们 | 固定问题与回答采样／导入 | 已有独立分析流程 |

抓取请求数不是访客数，训练用途访问不是搜索点击。网址公开检查也不能取得历史流量。没有日志、日志缺口和未匹配声明，都不能解释为“没有 AI 来过”。

## 先看示例

没有真实日志时，可先查看明确标注的合成演示：

```sh
node bin/beat-geo.mjs crawls --site example.com \
  --input examples/crawls.example.json --out ./runs/crawls-demo --lang zh
```

该示例不代表任何真实站点的数据。真实站点接入验收还需使用自己的日志完成；本地自动化测试不能替代这一项。
