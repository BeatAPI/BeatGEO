import { summarize as summarizeObservations, deduplicateObservations } from "./metrics.js";
import { filterRuns, citationRows, promptRows } from "./evidence.js";
let spritePrefix = "/assets/icons.svg";
try {
	const response = await fetch(spritePrefix);
	if (response.ok) {
		const sprite = document.createElement("div");
		sprite.hidden = true;
		sprite.innerHTML = await response.text();
		document.body.prepend(sprite);
		spritePrefix = "";
	}
} catch { /* Labels remain usable if the local icon asset cannot load. */ }
const $ = (id) => document.getElementById(id);
const escape = (text) =>
	String(text ?? "").replace(
		/[&<>"']/g,
		(x) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[x],
	);
const icon = (name) => `<svg class="icon" aria-hidden="true"><use href="${spritePrefix}#${name}"></use></svg>`;
const paintIcons = () =>
	document.querySelectorAll("[data-icon]").forEach((e) => {
		e.outerHTML = icon(e.dataset.icon);
	});
let token = "",
	active = false,
	runs = [],
	summary = {},
	mode = "analytics",
	category = "精选",
	agentTab = "概览",
	analysisTab = "可见性",
	browserProfiles = [];
let drafts = [];
try {
	drafts = JSON.parse(localStorage.getItem("beat-geo-agent-drafts") || localStorage.getItem("open-profound-agent-drafts") || "[]");
	if (!Array.isArray(drafts)) drafts = [];
} catch {
	/* A malformed local draft must not prevent opening the workspace. */
}
const workspace = [["agents", "智能体草稿", "agents"], ["help", "使用指南", "question"]];
const analytics = [["visibility", "品牌监测", "answer-engine-insights"], ["help", "使用指南", "question"]];
const features = {
	home: ["AI 营销人员", "聊天、品牌上下文和分析工具协作", "assistant"],
	projects: ["项目", "组织研究、工作表、文档与智能体", "projects"],
	context: ["上下文管理器", "维护品牌资料、受众、产品信息和写作要求", "context-manager"],
	sheets: ["工作表", "批量研究、单元格智能体和结构化输出", "sheets"],
	documents: ["文档", "内容草稿、协作编辑、版本与导出", "documents-page"],
	pages: ["页面", "页面级引用、内容表现和优化机会", "documents"],
	volume: ["提示量", "真实用户问题的需求发现与趋势", "conversation"],
	traffic: ["AI 代理分析", "识别爬虫访问、被抓取页面与 AI 引荐流量", "agent-analytics"],
	shopping: ["购物", "产品推荐、商家、SKU 与购物答案的表现", "shopping-bag"],
	dashboards: ["仪表板", "组合图表、保存筛选条件和共享报告", "dashboard"],
	inbox: ["收件箱", "智能体运行通知与协作动态", "inbox"],
};
const templates = [
	{
		name: "AEO-Optimized FAQ Generator",
		desc: "This agent generates an AEO-optimized FAQ section for an article by extracting the key questions.",
		category: "内容创作",
		icon: "conversation",
		prompt: "为指定文章设计 FAQ：先阅读原文，抽取用户问题，给出有来源支持的简明回答。",
	},
	{
		name: "Multi Language Article Translator",
		desc: "Scrapes an article URL once, then iterates in parallel over a list of target languages.",
		category: "内容创作",
		icon: "documents",
		prompt: "读取文章并生成中文、英文、日文版本，保留引文与事实来源。",
	},
	{
		name: "Research-backed PDP Optimizer",
		desc: "Research product detail pages and prepare a sourced content optimization brief.",
		category: "内容优化",
		icon: "shopping-bag",
		prompt: "检查产品详情页的信息缺口，并基于引用来源生成优化建议。",
	},
	{
		name: "YouTube Metadata Optimizer",
		desc: "Analyze a YouTube video and prepare AEO-optimized titles, descriptions and key topics.",
		category: "内容优化",
		icon: "play-circle--filled",
		prompt: "分析视频标题与描述，生成与视频内容一致的元数据优化方案。",
	},
	{
		name: "Brand Visibility Research",
		desc: "Ask your question on the real model website and retain the answer with visible sources.",
		category: "研究",
		icon: "answer-engine-insights",
		prompt:
			"Which unified AI API providers would you recommend for text, image and video models? Give a brief shortlist with official sources.",
	},
	{
		name: "Citation Evidence Report",
		desc: "Review collected responses and their visible citations in a compact evidence report.",
		category: "报告",
		icon: "documents-page",
		prompt: "总结已采集回答的品牌提及和引用来源，分别列出完成、超时与需要处理的记录。",
	},
];
function toast(text) {
	$("toast").textContent = text;
	$("toast").hidden = false;
	setTimeout(() => {
		$("toast").hidden = true;
	}, 4500);
}
function nav() {
	$("nav").innerHTML = (mode === "workspace" ? workspace : analytics)
		.map(
			([id, label, i]) =>
				`<a href="#${id}" class="${page() === id ? "active" : ""}">${icon(i)}<span>${label}</span></a>`,
		)
		.join("");
}
const page = () => location.hash.slice(1) || "visibility";
function banner(title, description) {
	return `<section class="education" ${sessionStorage.getItem("hide-education") ? "hidden" : ""}><div class="education-card"><button class="hide-banner" data-action="hide-banner">隐藏</button><div class="demo-art"><div class="demo-graph"><div class="demo-chain"><div class="demo-node">${icon("answer-engine-insights")}</div><div class="demo-node">${icon("agents")}</div></div><div class="demo-branches"><div class="demo-node">${icon("code-block")}</div><div class="demo-node">${icon("assistant")}</div></div></div><a class="demo-play" href="https://github.com/BeatAPI/BeatGeo#product-flow" target="_blank" rel="noopener noreferrer" aria-label="查看 BeatGeo 产品流程">${icon("play--filled")}</a></div><div class="education-copy"><h2>${title}</h2><p>${description}</p><div class="actions"><button class="primary" data-page="help">${icon("play-circle--filled")}使用指南</button><a class="secondary" style="padding:6px 10px;border-radius:8px" href="https://github.com/BeatAPI/BeatGeo#product-flow" target="_blank" rel="noopener noreferrer">${icon("book-open")} 产品流程</a></div></div></div></section>`;
}
function tabs(items, current, attribute = "agent-tab") {
	return `<div class="tabs">${items.map((t) => `<button data-${attribute}="${t}" class="${current === t ? "active" : ""}">${t}</button>`).join("")}</div>`;
}
function cards() {
	const list =
		category === "精选"
			? templates.slice(0, 4)
			: category === "全部"
				? templates
				: templates.filter((t) => t.category === category);
	return list.length
		? `<div class="cards">${list.map((t) => `<button class="template-card" data-template="${templates.indexOf(t)}">${icon(t.icon)}<h3>${t.name}</h3><p>${t.desc}</p><small>BeatGeo · 工作流草稿</small></button>`).join("")}</div>`
		: '<div class="empty">此分类尚无模板。</div>';
}
function agents() {
	$("main").innerHTML =
		banner(
			"BeatGeo 智能体助力营销团队将创意转化为实际行动",
			"使用智能体发现机会、研究引用来源、优化内容与生成报告",
		) +
		`<section class="page"><div class="page-heading"><h1>智能体</h1></div><div class="tabs-row">${tabs(["概览", "全部智能体", "模板", "已计划"], agentTab)}<div class="actions"><button class="secondary" data-action="new-folder">${icon("new-folder")}新建文件夹</button><button class="primary" data-action="new-agent">${icon("plus")}新建智能体</button></div></div>${agentTab === "概览" ? `<section class="composer-area"><h2>您想创建什么？</h2><div class="composer"><textarea id="agent-prompt" placeholder="描述您想创建的智能体…" aria-label="描述智能体"></textarea><div class="composer-tools"><button class="chip round" data-action="add-context" aria-label="添加上下文">${icon("plus")}</button><button class="chip" data-action="model">自动 <span class="muted">Medium</span>${icon("chevron-down")}</button><button class="icon-button" data-action="usage" aria-label="用量">${icon("speedometer--filled")}</button><button class="icon-button push" disabled aria-label="语音输入尚未接入">${icon("microphone")}</button><button class="round send" data-action="compose" aria-label="保存智能体草稿">${icon("arrow-up")}</button></div></div><div class="brainstorm"><span>不知道该做什么？</span><button class="secondary" data-action="brainstorm">开始头脑风暴${icon("arrow-up-right")}</button></div></section>` : ""}${["概览", "模板"].includes(agentTab) ? `<section><div class="section-header"><span>从模板开始</span><button data-agent-tab="模板">查看全部 ${icon("chevron-right")}</button></div><div class="categories">${["全部", "精选", "内容创作", "内容优化", "研究", "报告", "外联"].map((c) => `<button data-category="${c}" class="${category === c ? "selected" : ""}">${c}</button>`).join("")}</div>${cards()}</section>` : ""}${agentTab === "已计划" ? '<div class="empty"><h2>尚无已计划的智能体</h2><p>定时运行尚未接入。当前可从“答案引擎洞察”发起一次真实网页采集。</p><button class="secondary" data-page="visibility">查看监测</button></div>' : `<section class="recent"><h3>${agentTab === "全部智能体" ? "全部智能体" : "最近编辑"}</h3><div class="toolbar"><select id="draft-status" aria-label="状态"><option value="all">所有状态</option><option value="draft">草稿</option></select><span class="tag">本地草稿 · 尚未执行</span><input id="draft-search" placeholder="搜索智能体" aria-label="搜索智能体"></div><div id="draft-list"></div></section>`}</section>`;
	draftList();
}
function draftList() {
	if (!$("draft-list")) return;
	const q = $("draft-search")?.value.toLowerCase() || "";
	const rows = drafts.filter((d) => d.name.toLowerCase().includes(q));
	$("draft-list").innerHTML = rows.length
		? `<table><thead><tr><th>名称</th><th>状态</th><th>最近编辑</th><th></th></tr></thead><tbody>${rows.map((d) => `<tr><td>${escape(d.name)}</td><td><span class="tag">草稿</span></td><td>${new Date(d.at).toLocaleString()}</td><td><button data-draft="${d.id}">查看</button></td></tr>`).join("")}</tbody></table>`
		: '<div class="empty">尚无智能体。选择模板或创建一个草稿。</div>';
}
function monitor() {
	$("main").innerHTML =
		banner(
			"了解您的品牌在 AI 答案引擎中如何呈现",
			"追踪问题、查看品牌在回答中被提及的频率，并保留这些回答所依据的来源。",
		) +
		`<section class="page"><div class="page-heading"><h1>品牌监测</h1><button class="primary" data-action="collect">${icon("plus")}添加采集</button></div><div class="tabs-row">${tabs(["可见性", "引用", "提示词", "原始回答"], analysisTab, "analysis-tab")}<div class="actions"><button class="secondary" data-action="export">导出回答</button><button class="icon-button" data-action="refresh" aria-label="刷新">${icon("calendar")}</button></div></div><div class="toolbar"><select id="brand-filter" aria-label="品牌"><option value="all">所有品牌</option>${[...new Set(runs.map(r => r.brand).filter(Boolean))].map(brand => `<option value="${escape(brand)}">${escape(brand)}</option>`).join("")}</select><select id="engine-filter" aria-label="平台"><option value="all">所有平台</option><option value="chatgpt">ChatGPT</option><option value="gemini">Gemini</option></select><select id="status-filter" aria-label="状态"><option value="all">所有状态</option><option value="completed">已完成</option><option value="attention">需处理</option></select><span class="tag">真实网页样本</span><span class="muted push" id="active-state"></span></div><div class="metrics"><div class="metric"><span class="muted">字面品牌提及率</span><strong id="mention-rate">—</strong></div><div class="metric"><span class="muted">完成回答</span><strong id="completed-count">0</strong></div><div class="metric"><span class="muted">可见引用</span><strong id="citation-count">0</strong></div><div class="metric"><span class="muted">需处理 / 超时</span><strong id="attention-count">0</strong></div></div><p class="method-note">提及率基于已完成的网页回答 · <button data-action="method">统计口径</button></p><h3 id="evidence-title">回答与证据</h3><div id="evidence"></div></section>`;
	evidence();
}
const names = {
	completed: "已完成",
	opening: "打开网页",
	submitting: "正在发送",
	waiting: "等待回答",
	needs_attention: "需要处理",
	timeout: "等待超时",
	failed: "失败",
};
function evidence() {
	if (!$("evidence")) return;
	const engine = $("engine-filter").value,
		status = $("status-filter").value;
	const brand = $("brand-filter")?.value || "all";
	const list = filterRuns(runs.filter(run => brand === "all" || run.brand === brand), engine, status);
	const done = list.filter((r) => r.status === "completed");
	const stats = summarizeObservations(list);
	$("mention-rate").textContent = stats.mentionRate === null ? "—" : `${Math.round(stats.mentionRate * 100)}%`;
	$("completed-count").textContent = done.length;
	$("citation-count").textContent = done.reduce((n, r) => n + (r.citations || []).length, 0);
	$("attention-count").textContent = list.filter((r) =>
		["needs_attention", "timeout", "failed"].includes(r.status),
	).length;
	const brandCount = new Set(list.map(run => run.brand).filter(Boolean)).size;
	if (brandCount > 1) $("mention-rate").textContent = "选择品牌";
	$("active-state").textContent = `${active ? "采集中" : "空闲"} · 超时 ${stats.timeout} · 失败/需处理 ${stats.failed - stats.timeout} · 有效评分 ${stats.scored}/${stats.total}`;
	$("evidence-title").textContent = analysisTab === "可见性" ? "回答与证据" : analysisTab;
	if (analysisTab !== "可见性") {
		renderEvidenceView(list);
		return;
	}
	$("evidence").innerHTML = list.length
		? `<table><thead><tr><th>问题</th><th>平台</th><th>状态</th><th>品牌提及</th><th>来源</th><th></th></tr></thead><tbody>${list.map((r) => `<tr><td style="max-width:420px">${escape(r.prompt)}</td><td>${escape(r.engine)}</td><td><span class="tag">${names[r.status] || escape(r.status)}</span></td><td>${r.brandMentioned === true ? "已提及" : r.brandMentioned === false ? "未检出" : "—"}</td><td>${r.citations?.length || 0}</td><td><button data-run="${escape(r.id)}">查看 ${icon("chevron-right")}</button></td></tr>`).join("")}</tbody></table>`
		: '<div class="empty"><h2>尚无回答</h2><p>添加一个问题，先从真实网页建立基线。</p><button class="primary" data-action="collect">添加采集</button></div>';
}
function dialog(html) {
	$("dialog-body").innerHTML = html;
	$("dialog").showModal();
}
function renderEvidenceView(list) {
	if (analysisTab === "引用") {
		const rows = citationRows(list);
		$("evidence").innerHTML = rows.length
			? `<table><thead><tr><th>引用页面</th><th>域名</th><th>引用回答数</th><th>平台</th></tr></thead><tbody>${rows.map((r) => `<tr><td><a class="source-link" href="${escape(r.url)}" target="_blank" rel="noopener noreferrer">${escape(r.title || r.url)} ${icon("arrow-up-right")}</a></td><td>${escape(r.domain)}</td><td>${r.count}</td><td>${escape(r.engines.join(" · "))}</td></tr>`).join("")}</tbody></table>`
			: '<div class="empty">当前筛选下尚无可见引用。</div>';
	} else if (analysisTab === "提示词") {
		const rows = promptRows(list);
		$("evidence").innerHTML = rows.length
			? `<table><thead><tr><th>问题</th><th>品牌</th><th>平台</th><th>完成 / 采集</th><th>提及率</th></tr></thead><tbody>${rows.map((r) => `<tr><td>${escape(r.prompt)}</td><td>${escape(r.brand || "—")}</td><td>${escape(r.engines.join(" · "))}</td><td>${r.completed} / ${r.total}</td><td>${r.mentionRate === null ? "—" : Math.round(r.mentionRate * 100) + "%"}</td></tr>`).join("")}</tbody></table>`
			: '<div class="empty">尚无已采集问题。</div>';
	} else {
		$("evidence").innerHTML = list.length
			? list
					.map(
						(r) =>
							`<article class="response-card"><div class="row"><span>${escape(r.engine)} · ${names[r.status] || escape(r.status)}</span><small class="muted">${new Date(r.startedAt).toLocaleString()}</small></div><h3>${escape(r.prompt)}</h3><p class="response-text">${escape(r.answer || r.partialAnswer || r.error || "等待回答…")}</p><button class="secondary" data-run="${escape(r.id)}">查看完整回答 ${icon("chevron-right")}</button></article>`,
					)
					.join("")
			: '<div class="empty">尚无原始回答。</div>';
	}
}
function newAgent(t) {
	dialog(
		`<h2>${t ? "从模板创建" : "新建智能体"}</h2><form id="draft-form"><label for="draft-name">名称</label><input id="draft-name" value="${escape(t?.name || "")}" required maxlength="160"><label for="draft-prompt">工作流目标</label><textarea id="draft-prompt" required>${escape(t?.prompt || $("agent-prompt")?.value || "")}</textarea><p>先保存可编辑草稿。自动生成与执行工作流尚未接入。</p><button class="primary submit">保存草稿</button></form>`,
	);
}
async function collectDialog() {
	dialog(
		`<h2>添加网页采集</h2><form id="collect-form"><label for="engine">平台</label><select id="engine"><option value="chatgpt">ChatGPT</option><option value="gemini">Gemini</option></select><label for="profile">Chrome 工作区</label><select id="profile" required disabled><option value="">连接 BeatBrowser…</option></select><label for="brand">关注品牌</label><input id="brand" required placeholder="输入您的品牌" maxlength="120"><label for="prompt">问题</label><textarea id="prompt" required maxlength="4000" placeholder="您的客户会向 AI 询问什么？"></textarea><p>独立后台工作区 · 复用 Chrome 登录</p><button class="primary submit" disabled>开始采集</button><p id="collect-message" role="status"></p></form>`,
	);
	const form = $("collect-form");
	try {
		const response = await fetch("/api/browser");
		const data = await response.json();
		if (!response.ok) throw Error("连接失败，请检查 BeatBrowser。");
		if (!form.isConnected) return;
		if (!data.taskSpaces) throw Error("当前启用了旧标签页模式。请移除 BEAT_BROWSER_SPACES=0 并重启服务。");
		browserProfiles = data.profiles;
		if (!browserProfiles.length) throw Error("请在 Chrome 中启用 BeatBrowser。");
		$("profile").innerHTML =
			(browserProfiles.length > 1 ? '<option value="">选择 Chrome 配置</option>' : "") +
			browserProfiles
				.map((p, i) => `<option value="${escape(p.profileId)}">Chrome ${i + 1} · ${escape(p.description)}</option>`)
				.join("");
		$("profile").disabled = false;
		form.querySelector(".submit").disabled = active;
		if (active) $("collect-message").textContent = "已有采集进行中。";
	} catch (error) {
		if (form.isConnected) $("collect-message").textContent = error.message;
	}
}
function runDialog(id) {
	const r = runs.find((r) => r.id === id);
	if (!r) return;
	dialog(
		`<h2>${escape(r.engine)} · ${names[r.status] || escape(r.status)}</h2><p>${escape(r.prompt)}</p><p>${new Date(r.startedAt).toLocaleString()} · ${escape(r.surface)} · ${escape(r.executionMode || "background-tab")}</p><p>等待 ${Math.round((r.elapsedMs || (Date.parse(r.finishedAt || new Date().toISOString()) - Date.parse(r.startedAt))) / 1000)} 秒 · 尝试 ${r.attempts || 1} 次</p>${r.error ? `<p role="alert">${escape(r.error)}</p>` : ""}<div class="answer">${escape(r.answer || r.partialAnswer || "尚无完整回答")}</div><ul class="sources">${(
			r.citations || []
		)
			.filter((c) => /^https?:\/\//.test(c.url))
			.map(
				(c) =>
					`<li><a href="${escape(c.url)}" target="_blank" rel="noopener noreferrer">${escape(c.title || c.url)}</a></li>`,
			)
			.join("")}</ul>`,
	);
}
function render() {
	if (workspace.some(([id]) => id === page()) && page() !== "home") mode = "workspace";
	else if (analytics.some(([id]) => id === page()) && page() !== "home") mode = "analytics";
	document.querySelectorAll("[data-mode]").forEach((b) => {
		b.classList.toggle("selected", b.dataset.mode === mode);
		b.setAttribute("aria-selected", String(b.dataset.mode === mode));
	});
	nav();
	if (page() === "agents") agents();
	else if (page() === "visibility") monitor();
	else if (features[page()]) {
		const [title, desc, i] = features[page()];
		$("main").innerHTML =
			`<section class="page"><div class="page-heading"><h1>${title}</h1><span class="tag">待接入</span></div><div class="tabs-row"></div><div class="empty">${icon(i)}<h2>${title}</h2><p>${desc}</p><p>此模块的界面入口已建立，业务功能尚未接入。</p><button class="secondary" data-page="visibility">查看已接入的网页监测</button></div></section>`;
	} else {
		$("main").innerHTML =
			`<section class="page"><div class="page-heading"><h1>${page() === "start" ? "快速入门" : "BeatGeo"}</h1></div><div class="notice">当前可用：真实网页采集、回答与引用查看、结果筛选和导出，以及智能体本地草稿。</div><div class="empty"><h2>从真实回答开始</h2><p>添加品牌问题，收集原始回答和引用，再围绕这些证据改进内容。网站诊断、行动闭环和多平台定时监控见 GitHub 路线图。</p><button class="primary" data-page="visibility">开始监测</button><button class="secondary" data-page="agents">查看智能体</button></div></section>`;
	}
	paintIcons();
	document.title = `BeatGeo · ${page() === "agents" ? "智能体" : page() === "visibility" ? "答案引擎洞察" : features[page()]?.[0] || "工作区"}`;
}
async function refresh() {
	try {
		const response = await fetch("/api/runs");
		if (!response.ok) throw Error();
		const data = await response.json();
		runs = deduplicateObservations(data.runs);
        const selector = $("brand-filter");
        if (selector) {
            const selected = selector.value;
            const brands = [...new Set(runs.map(run => run.brand).filter(Boolean))];
            selector.innerHTML = `<option value="all">所有品牌</option>${brands.map(brand => `<option value="${escape(brand)}">${escape(brand)}</option>`).join("")}`;
            selector.value = brands.includes(selected) ? selected : "all";
        }
		summary = data.summary;
		active = Boolean(data.active);
		evidence();
	} catch {
		toast("无法连接本地采集服务。");
	}
}
document.addEventListener("click", (e) => {
	const target = e.target.closest(
		"[data-page],[data-mode],[data-agent-tab],[data-category],[data-action],[data-template],[data-run],[data-draft],[data-analysis-tab]",
	);
	if (!target) return;
	const d = target.dataset;
	if (d.page) {
		location.hash = d.page;
		return;
	}
	if (d.mode) {
		mode = d.mode;
		document.querySelectorAll("[data-mode]").forEach((b) => {
			b.classList.toggle("selected", b === target);
			b.setAttribute("aria-selected", b === target ? "true" : "false");
		});
		nav();
		return;
	}
	if (d.agentTab) {
		agentTab = d.agentTab;
		agents();
		return;
	}
	if (d.category) {
		category = d.category;
		agents();
		return;
	}
	if (d.template !== undefined) {
		newAgent(templates[Number(d.template)]);
		return;
	}
	if (d.run) {
		runDialog(d.run);
		return;
	}
	if (d.draft) {
		const draft = drafts.find((x) => x.id === d.draft);
		dialog(
			`<h2>${escape(draft.name)}</h2><div class="answer">${escape(draft.prompt)}</div><p>本地草稿，尚未执行。</p>`,
		);
		return;
	}
	if (d.analysisTab) {
		analysisTab = d.analysisTab;
		document.querySelectorAll("[data-analysis-tab]").forEach((b) => b.classList.toggle("active", b === target));
		evidence();
		return;
	}
	switch (d.action) {
		case "method":
			dialog(
				"<h2>统计口径</h2><p>提及率 = 检出品牌的已完成回答 / 可评分的已完成回答。超时、失败和未完成记录不算未提及。</p><p>这是当前浏览器账户的样本，不能代表全市场。可见引用仅统计回答里可见的外部链接；同一次回答中的重复链接只计一次。</p><p>多品牌不会混算提及率。趋势、推荐识别与竞品份额仍待接入此工作台。</p>",
			);
			break;
		case "hide-banner":
			sessionStorage.setItem("hide-education", "1");
			document.querySelector(".education").hidden = true;
			break;
		case "collect":
			collectDialog();
			break;
		case "new-agent":
		case "compose":
			newAgent();
			break;
		case "new-folder":
			toast("文件夹管理尚未接入；当前草稿统一保存在智能体列表。");
			break;
		case "brainstorm":
			category = "研究";
			agents();
			break;
		case "add-context":
			location.hash = "context";
			break;
		case "model":
			toast("执行模型尚未连接。当前可先保存智能体草稿。");
			break;
		case "usage":
			toast("当前没有模型 API 消耗；网页采集使用网站账号。");
			break;
		case "refresh":
			refresh();
			break;
		case "export": {
			const blob = new Blob([JSON.stringify({ summary, runs }, null, 2)], { type: "application/json" });
			const url = URL.createObjectURL(blob);
			const a = document.createElement("a");
			a.href = url;
			a.download = "beat-geo-evidence.json";
			a.click();
			URL.revokeObjectURL(url);
			break;
		}
	}
});
document.addEventListener("input", (e) => {
	if (e.target.id === "draft-search") draftList();
});
document.addEventListener("change", (e) => {
	if (["brand-filter", "engine-filter", "status-filter"].includes(e.target.id)) evidence();
});
document.addEventListener("submit", async (e) => {
	if (e.target.id === "draft-form") {
		e.preventDefault();
		const draft = {
			id: crypto.randomUUID(),
			name: $("draft-name").value.trim(),
			prompt: $("draft-prompt").value.trim(),
			at: Date.now(),
		};
		if (!draft.name || !draft.prompt) return;
		drafts.unshift(draft);
		localStorage.setItem("beat-geo-agent-drafts", JSON.stringify(drafts));
		$("dialog").close();
		location.hash = "agents";
		render();
		toast("草稿已保存。");
	}
	if (e.target.id === "collect-form") {
		e.preventDefault();
		if (active) return;
		const button = e.target.querySelector('button[type="submit"],button.submit');
		button.disabled = true;
		try {
			const r = await fetch("/api/run", {
				method: "POST",
				headers: { "Content-Type": "application/json", "x-beat-geo-token": token },
				body: JSON.stringify({
					engine: $("engine").value,
					brand: $("brand").value,
					prompt: $("prompt").value,
					profileId: $("profile").value,
				}),
			});
			if (!r.ok) throw Error((await r.json()).error);
			$("dialog").close();
			await refresh();
		} catch (error) {
			$("collect-message").textContent = error.message;
			button.disabled = false;
		}
	}
});
$("collapse").onclick = () => document.body.classList.toggle("collapsed");
window.addEventListener("hashchange", render);
render();
fetch("/api/bootstrap")
	.then((r) => r.json())
	.then((data) => {
		token = data.token;
		return refresh();
	})
	.catch(() => toast("本地服务尚未就绪。"));
setInterval(refresh, 5000);
