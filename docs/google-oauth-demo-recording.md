# BeatGEO Google OAuth 审核录屏

目的：展示 BeatAPI 品牌下的 BeatGEO 桌面客户端如何请求并使用 GSC、GA 只读权限。建议 3–5 分钟，这只是制作建议，不是 Google 时长要求。目前尚未完成真实授权验收，本文件是拍摄脚本，不是提交完成记录。

## 录制前

- 使用已有权限且允许向审核人员展示数据的自有网站。关闭无关标签、通知与密码管理器提示。
- 产品切换 EN，Google 权限请求页底部选择 English。保留浏览器地址栏，显示应用身份与客户端 ID；不要展示客户端密钥、令牌、ENV 或密码。
- 先实测选择资源并加载报告。报错时先修复，再录制成功流程；无数据时如实说明，不能用示例数据冒充 Google 返回值。
- 审核品牌是 BeatAPI，产品是其本地 SEO/GEO 工具 BeatGEO，桌面客户端也叫 BeatGEO。开场明确二者关系，避免审核人员误以为是不同应用。

## 镜头顺序与英文讲解

| 镜头 | 实际操作 | 英文说明示例 |
| --- | --- | --- |
| 1 · 产品与用途 | 打开 BeatGEO 品牌工作区，从 GEO → AI Traffic & Crawls 进入连接页 | “BeatGEO is BeatAPI's local SEO and GEO workspace. This connection lets users read reports for websites they manage.” |
| 2 · 授权入口 | 点击 Continue with Google，选择自有 Google 账号 | “The user starts the connection and chooses their own Google account.” |
| 3 · 完整同意页 | 展开权限，展示两个只读范围及地址栏中的 client_id；如出现未验证警告，也如实展示；授权 | “Search Console read-only access retrieves search performance. Analytics read-only access lists GA4 properties and retrieves referral reports. No write access is requested.” |
| 4 · GSC 使用 | 返回同一品牌，选择 GSC 网站并同步，展示真实查询词、点击、展示和排名 | “The user selects a Search Console property. These are the property's actual search performance results.” |
| 5 · GA 使用 | 选择 GA4 property 并同步，展示实际来源流量报告及更新时间 | “Analytics Admin lists the properties available to this account. Analytics Data retrieves the selected property's report, including AI referral traffic when present.” |
| 6 · 断开连接 | 展示产品的数据说明；断开 GA/GSC，确认界面回到未连接状态 | “The user can disconnect each service from this workspace. Disconnecting removes its locally stored connection and snapshots.” |

录制必须覆盖真实授权、实际读取与用途，不能仅展示 Google Cloud 配置页或静态截图。录制后检查是否泄露无关账号或业务数据。保持完整授权画面和实际结果；可裁掉等待时间，不伪造成功或隐藏授权错误。

## 提交

导出清晰的屏幕录制，上传为审核人员可以访问的 YouTube 不公开列出（Unlisted）视频，取得真实链接后填写 Google Auth Platform → Data Access 的演示视频字段，再提交已准备的品牌申诉/权限审核。上传与提交记录分别核对；上传成功不等于审核通过。

官方依据：[Google 验证要求](https://support.google.com/cloud/answer/13464321?hl=en)、[敏感范围验证](https://developers.google.com/identity/protocols/oauth2/production-readiness/sensitive-scope-verification)。Google 要求英文完整授权页、相同的应用身份，以及每项权限所支持功能的实际演示。
