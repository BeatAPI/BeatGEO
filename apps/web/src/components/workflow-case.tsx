import { useState } from "react";
import { beatapiCase, caseMarkdown } from "@/lib/case-studies/beatapi";
import { useLocale } from "@/lib/i18n";

export function WorkflowCase() {
	const { locale } = useLocale();
	const [index, setIndex] = useState(0);
	const c = beatapiCase;
	const step = c.steps[index];
	const text = (en: string, zh: string) => (locale === "zh" ? zh : en);
	const download = () => {
		const url = URL.createObjectURL(new Blob([caseMarkdown(locale)], { type: "text/markdown;charset=utf-8" }));
		const link = document.createElement("a");
		link.href = url;
		link.download = `beatapi-agent-case-${locale}.md`;
		link.click();
		setTimeout(() => URL.revokeObjectURL(url), 1000);
	};
	return (
		<article className="mx-auto w-full max-w-5xl space-y-10 pb-10">
			<header className="space-y-5 border-b pb-8">
				<p className="text-xs font-medium uppercase tracking-widest text-muted-foreground">
					BeatAPI / {c.date} / {text("Recorded case · Not a live run", "实测回顾 · 非实时运行")}
				</p>
				<h1 className="max-w-3xl text-3xl font-semibold tracking-tight sm:text-5xl">{c.title[locale]}</h1>
				<p className="max-w-3xl text-base leading-7 text-muted-foreground">{c.intro[locale]}</p>
				<div className="flex flex-wrap gap-3 text-sm">
					<button type="button" onClick={download} className="rounded-md border px-4 py-2 hover:bg-muted">
						{text("Download case summary", "下载案例摘要")}
					</button>
					<a
						href={c.evidenceUrl}
						target="_blank"
						rel="noreferrer"
						className="rounded-md border px-4 py-2 hover:bg-muted"
					>
						{text("Read acceptance evidence", "查看实测验收记录")} ↗
					</a>
				</div>
			</header>
			<section className="space-y-3" aria-label={text("Reusable request", "可复用指令")}>
				<h2 className="text-sm font-medium text-muted-foreground">
					{text("Start with a website in conversation", "从对话里给出网址开始")}
				</h2>
				<blockquote className="rounded-xl border bg-muted/40 p-5 text-lg leading-8">{c.prompt[locale]}</blockquote>
				<p className="text-xs text-muted-foreground">
					{text(
						"A reusable request for this workflow; not a transcript of the original chat.",
						"这是按实测链路整理的可复用指令，并非原始对话逐字稿。",
					)}
				</p>
			</section>
			<section className="space-y-5" aria-label={text("Workflow walkthrough", "操作链路回顾")}>
				<div className="flex items-baseline justify-between gap-4">
					<h2 className="text-xl font-semibold">{text("Follow the work", "沿着任务看过程")}</h2>
					<span className="font-mono text-sm text-muted-foreground">
						{index + 1} / {c.steps.length}
					</span>
				</div>
				<div className="grid gap-5 md:grid-cols-[220px_1fr]">
					<nav aria-label={text("Case steps", "案例步骤")} className="grid grid-cols-2 gap-2 md:flex md:flex-col">
						{c.steps.map((item, i) => (
							<button
								key={item.id}
								type="button"
								aria-pressed={index === i}
								aria-controls="case-step-panel"
								onClick={() => setIndex(i)}
								className={`flex shrink-0 items-center gap-3 rounded-md border px-3 py-3 text-left text-sm ${index === i ? "border-foreground bg-foreground text-background" : "border-transparent hover:bg-muted"}`}
							>
								<span className="font-mono opacity-60">0{i + 1}</span>
								{item.title[locale]}
							</button>
						))}
					</nav>
					<div id="case-step-panel" className="min-w-0 rounded-xl border p-5 sm:p-7" aria-live="polite">
						<p className="mb-5 text-xs uppercase tracking-widest text-muted-foreground">
							{text("Observed in this test", "本次实测记录")}
						</p>
						<h3 className="text-2xl font-semibold leading-snug">{step.result[locale]}</h3>
						<p className="mt-4 text-sm leading-7 text-muted-foreground">{step.detail[locale]}</p>
						<p className="mt-6 border-l-2 border-emerald-500 pl-4 text-sm leading-6">{step.proof[locale]}</p>
						<details className="mt-5 text-xs text-muted-foreground">
							<summary className="cursor-pointer">{text("MCP operation details", "MCP 操作细节")}</summary>
							<p className="mt-3 break-words font-mono leading-6">{step.tools}</p>
						</details>
						<div className="mt-8 flex justify-between gap-4">
							<button
								type="button"
								disabled={index === 0}
								onClick={() => setIndex(index - 1)}
								className="text-sm underline underline-offset-4 disabled:opacity-30"
							>
								{text("Previous step", "上一步")}
							</button>
							<button
								type="button"
								disabled={index === c.steps.length - 1}
								onClick={() => setIndex(index + 1)}
								className="text-sm underline underline-offset-4 disabled:opacity-30"
							>
								{text("Next step", "下一步")}
							</button>
						</div>
					</div>
				</div>
			</section>
			<section className="space-y-4">
				<h2 className="text-xl font-semibold">
					{text("What the two samples actually showed", "两轮样本实际得到什么")}
				</h2>
				<p className="break-words text-sm leading-6 text-muted-foreground">
					{text("Question sampled twice:", "两轮使用同一个问题：")} {c.question}
				</p>
				<div className="grid gap-4 sm:grid-cols-2">
					{c.runs.map((run) => (
						<div key={run.duration} className="rounded-xl border p-5">
							<p className="text-sm text-muted-foreground">
								{run.label[locale]} · {run.duration}
							</p>
							<p className="mt-3 text-4xl font-semibold tabular-nums">
								{run.citations}
								<span className="ml-2 text-sm font-normal text-muted-foreground">
									{text("visible citation links", "条可见引用")}
								</span>
							</p>
							<p className="mt-3 text-sm text-muted-foreground">
								{run.characters.toLocaleString("en-US")}{" "}
								{text("answer characters · BeatAPI absent", "字符正文 · 未提及 BeatAPI")}
							</p>
						</div>
					))}
				</div>
				<p className="text-sm leading-7 text-muted-foreground">
					{text(
						"0 of 2 answers mentioned BeatAPI. One pair matched, with no missing samples. No website change occurred between these samples, so this is not an improvement result.",
						"两次回答均未提及 BeatAPI，匹配一组、缺失为零。两轮之间没有修改官网，因此这不能当成优化后的提升结果。",
					)}
				</p>
			</section>
			<section className="space-y-4 rounded-xl border bg-muted/30 p-5 sm:p-7">
				<h2 className="text-xl font-semibold">{text("Turn this case into a video", "把这次案例做成视频")}</h2>
				<p className="text-sm leading-7 text-muted-foreground">
					{text(
						"The answers, operation receipts and dashboard screenshots were retained. There is no continuous recording of the original session. A 3–4 minute walkthrough can combine this recorded result with newly filmed, clearly labeled reproduction steps.",
						"已保留回答、操作回执和工作台截图，但没有原始会话的全程录屏。后续可以用 3–4 分钟讲清过程：用已有证据回顾结果，再补录并标明复现操作。",
					)}
				</p>
				<ol className="grid gap-3 text-sm sm:grid-cols-3">
					<li>01 / {text("Show the website request", "给网址，提出任务")}</li>
					<li>02 / {text("Show collection and evidence", "展示采集与证据")}</li>
					<li>03 / {text("Edit the shared draft", "修改草稿，交回用户")}</li>
				</ol>
			</section>
			<section className="space-y-4">
				<h2 className="text-lg font-semibold">{text("What this case can establish", "这次案例的边界")}</h2>
				<ul className="list-disc space-y-2 pl-5 text-sm leading-7 text-muted-foreground">
					{c.limits.map((item) => (
						<li key={item.en}>{item[locale]}</li>
					))}
				</ul>
			</section>
		</article>
	);
}
