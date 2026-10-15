import {
	buildQuestionBank,
	categoryQuestionProfile,
	QUESTION_CATEGORIES,
	type QuestionLanguage,
	type QuestionProfile,
} from "@workspace/lib/question-bank";
import { Button } from "@workspace/ui/components/button";
import { Input } from "@workspace/ui/components/input";
import { Label } from "@workspace/ui/components/label";
import { useState } from "react";

export function QuestionBankPicker({
	brandName,
	researchUnavailable,
	onUse,
}: {
	brandName: string;
	researchUnavailable: boolean;
	onUse: (profile: QuestionProfile) => void;
}) {
	const [category, setCategory] = useState("");
	const [language, setLanguage] = useState<QuestionLanguage>("en");
	const [custom, setCustom] = useState({ category: "", audience: "", useCase: "" });
	const profile =
		category && category !== "custom" ? categoryQuestionProfile(category, language) : { ...custom, language };
	const count = buildQuestionBank(profile, brandName).length;
	return (
		<details className="rounded-xl border p-4" open={researchUnavailable}>
			<summary className="cursor-pointer font-medium">Use the starter question bank · no API key</summary>
			<p className="my-3 text-sm text-muted-foreground">
				Choose your business category. We fill the questions for you. These templates have not been verified against
				your website.
			</p>
			<div className="grid gap-3 sm:grid-cols-2">
				<div>
					<Label htmlFor="question-category">Business category</Label>
					<select
						id="question-category"
						className="mt-2 w-full rounded-md border bg-background p-2"
						value={category}
						onChange={(event) => setCategory(event.target.value)}
					>
						<option value="">Choose a category</option>
						{QUESTION_CATEGORIES.map((item) => (
							<option key={item.id} value={item.id}>
								{item[language][0]}
							</option>
						))}
						<option value="custom">Other business</option>
					</select>
				</div>
				<div>
					<Label htmlFor="question-language">Question language</Label>
					<select
						id="question-language"
						className="mt-2 w-full rounded-md border bg-background p-2"
						value={language}
						onChange={(event) => setLanguage(event.target.value as QuestionLanguage)}
					>
						<option value="en">English</option>
						<option value="zh">中文</option>
					</select>
				</div>
			</div>
			{category === "custom" && (
				<div className="mt-3 space-y-3">
					{(["category", "audience", "useCase"] as const).map((field) => (
						<div key={field}>
							<Label htmlFor={`business-${field}`}>
								{{ category: "Product category", audience: "Target customers", useCase: "Main customer goal" }[field]}
							</Label>
							<Input
								id={`business-${field}`}
								value={custom[field]}
								maxLength={160}
								onChange={(event) => setCustom({ ...custom, [field]: event.target.value })}
							/>
						</div>
					))}
				</div>
			)}
			<Button className="mt-4" variant="outline" disabled={!category || count === 0} onClick={() => onUse(profile)}>
				Generate {count || 12} starter questions
			</Button>
		</details>
	);
}
