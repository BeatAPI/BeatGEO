type Copy = { en: string; zh: string };
const copy = (en: string, zh: string): Copy => ({ en, zh });

export const beatapiCase = {
	date: "Demo run (undated)",
	website: "https://beatapi.io/",
	evidenceUrl:
		"https://github.com/BeatAPI/BeatGEO/blob/main/docs/beat-geo/agent-workflow-acceptance-demo-run.md",
	title: copy("One website. A complete Agent workflow.", "给一个网址，走完一次 Agent 工作流。"),
	intro: copy(
		"A recorded BeatAPI test: from a website in conversation to browser evidence, a comparison and a draft you can edit yourself.",
		"这次用 BeatAPI 做真实测试：从对话里的网址出发，采集浏览器回答、对比结果，再把草稿交回工作台编辑。",
	),
	prompt: copy(
		"Create a GEO project for beatapi.io. Review relevant buyer questions, collect browser answers, compare two fresh samples and prepare a draft for review.",
		"用 beatapi.io 建立 GEO 项目，整理买家会问的问题，采集真实浏览器回答，对比两轮样本，并准备一份待审核草稿。",
	),
	question:
		"Which API platforms let a small development team access text, image and video AI models with one API key? Compare their capabilities and limitations, and cite sources.",
	runs: [
		{ label: copy("Baseline", "第一轮"), duration: "8:59", characters: 13838, citations: 23 },
		{ label: copy("Follow-up", "第二轮"), duration: "8:21", characters: 14318, citations: 25 },
	],
	steps: [
		{
			id: "website",
			title: copy("Understand the website", "理解网站"),
			result: copy("Read the live BeatAPI homepage through BeatBrowser.", "通过 BeatBrowser 读取 BeatAPI 真实首页。"),
			detail: copy(
				"The homepage supplied first-party product context. Server-side reading was unavailable because of local proxy DNS, so the Agent used the connected browser.",
				"首页提供第一方产品背景。本机代理 DNS 限制了服务端读取，Agent 因此使用已连接的浏览器读取网站。",
			),
			tools: "inspect_website → BeatBrowser",
			proof: copy("Website read; claims still need verification.", "网站已读取，产品声明仍需核实。"),
		},
		{
			id: "project",
			title: copy("Create the project", "建立项目与问题"),
			result: copy(
				"Save a paused project, two buyer questions and three competitors.",
				"保存默认暂停的项目、两个买家问题和三个竞品。",
			),
			detail: copy(
				"OpenRouter, fal and Replicate were saved as competitor references. One of the two saved questions was sampled twice. The prompt did not name BeatAPI.",
				"保存 OpenRouter、fal、Replicate 作为竞品参考。两个问题中选取一个做两轮采样，问题本身没有点名 BeatAPI。",
			),
			tools: "create_brand → apply_workspace_command(save_questions)",
			proof: copy("Saved in the shared workspace.", "已保存到共用工作台。"),
		},
		{
			id: "collect",
			title: copy("Collect real answers", "采集真实回答"),
			result: copy(
				"Two ChatGPT browser answers, with 23 and 25 visible citation links.",
				"两轮 ChatGPT 浏览器回答，分别记录 23、25 条可见引用。",
			),
			detail: copy(
				"Both replies took over eight minutes. The worker received a durable task receipt and polled it until the answer and citations were saved. Neither reply mentioned BeatAPI.",
				"两轮均超过八分钟。Worker 取得持久化任务回执后持续查询，直到正文和引用保存完成。两次回答都没有提及 BeatAPI。",
			),
			tools: "start_collection → get_collection → get_run",
			proof: copy(
				"Original answer text and citation links were read back through MCP.",
				"已通过 MCP 读回回答原文和引用链接。",
			),
		},
		{
			id: "compare",
			title: copy("Compare matching evidence", "对比相同条件"),
			result: copy(
				"One matched pair. No missing samples. No mention-rate change.",
				"匹配一组样本，缺失为零，提及率差为零。",
			),
			detail: copy(
				"The same question, target configuration and brand definition were paired. The website was unchanged between samples; this is a baseline comparison, not an improvement claim.",
				"对比匹配了同一问题、目标配置和品牌定义。两轮之间没有修改官网，这是基线对比，不能当成优化效果。",
			),
			tools: "compare_collections",
			proof: copy("Matched 1 · Missing 0 · Difference 0 points.", "匹配 1 · 缺失 0 · 差值 0 个百分点。"),
		},
		{
			id: "draft",
			title: copy("Hand the draft back", "把草稿交回工作台"),
			result: copy(
				"MCP draft → dashboard edit → MCP read-back. Revision 1 became 2.",
				"MCP 写草稿 → 界面编辑 → MCP 读回，版本从 1 变为 2。",
			),
			detail: copy(
				"A documentation action was linked to the baseline. An automated browser exercised the ordinary manual controls, saved and reloaded the edit. The previous review was cleared and a stale write was rejected.",
				"文档优化动作关联到真实基线。自动化浏览器通过普通人工操作界面完成编辑、保存和刷新；旧审核被清除，过期版本写入被拒绝。",
			),
			tools: "apply_workspace_command(create_action / save_draft) → get_workspace",
			proof: copy("Draft revision 2 · Needs review · Not implemented.", "草稿版本 2 · 待审核 · 尚未实施。"),
		},
		{
			id: "monitor",
			title: copy("Keep monitoring in control", "控制后续监控"),
			result: copy(
				"Enable and pause controls were tested. The project finished paused.",
				"已测试启用与暂停控制，案例结束时保持暂停。",
			),
			detail: copy(
				"A 24-hour interval was saved and read back through MCP. No overnight monitoring was observed. Scheduled local work requires the computer, services and Chrome to remain online.",
				"已保存 24 小时间隔，并通过 MCP 读回。此次未验证跨夜监控；本地定时任务需要电脑、服务和 Chrome 持续在线。",
			),
			tools: "apply_workspace_command(configure_monitoring) → get_workspace",
			proof: copy("Paused · 24-hour configured interval.", "当前暂停 · 已配置 24 小时间隔。"),
		},
	],
	limits: [
		copy(
			"Two samples of one question do not measure overall GEO performance.",
			"一个问题的两轮样本，不能代表整体 GEO 表现。",
		),
		copy(
			"The browser account's model/search mode was not pinned. Only visible answer links were collected.",
			"浏览器账号的模型与搜索模式没有锁定，仅收集回答中的可见引用。",
		),
		copy(
			"Nine website checks remain unknown because of local proxy DNS; this is not a failed website score.",
			"本机代理 DNS 导致九项网站检查为未知，不能把它当成网站零分。",
		),
		copy(
			"No continuous screen recording was captured. The 44-second README video replays current local screens of these results; it is not a recording of the original session.",
			"此次没有全程录屏。README 中 44 秒视频用当前本地界面回顾这些结果，不是原始会话录像。",
		),
	],
};

export function caseMarkdown(locale: "en" | "zh") {
	const c = beatapiCase;
	return [
		`# ${c.title[locale]}`,
		`${c.date} · ${c.website}`,
		c.intro[locale],
		`> ${c.prompt[locale]}`,
		...c.steps.map(
			(step, index) =>
				`## ${index + 1}. ${step.title[locale]}\n\n${step.result[locale]}\n\n${step.detail[locale]}\n\n${step.proof[locale]}`,
		),
		`## ${locale === "zh" ? "边界与素材" : "Limits and footage"}`,
		...c.limits.map((item) => `- ${item[locale]}`),
		`[${locale === "zh" ? "实测验收记录" : "Acceptance evidence"}](${c.evidenceUrl})`,
	].join("\n\n");
}
