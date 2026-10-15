import { describe, expect, it } from "vitest";
import { buildQuestionBank, categoryQuestionProfile, QUESTION_CATEGORIES } from "./question-bank";

describe("starter question bank", () => {
	it.each(QUESTION_CATEGORIES.map((row) => row.id))(
		"gives %s a usable, unique starter set without writing questions",
		(id) => {
			const questions = buildQuestionBank(categoryQuestionProfile(id, "en"), "ExampleBrand");
			expect(questions).toHaveLength(12);
			expect(new Set(questions.map((row) => row.prompt)).size).toBe(12);
			expect(questions.filter((row) => row.prompt.includes("ExampleBrand"))).toHaveLength(3);
			expect(questions.every((row) => !row.prompt.includes("[category]") && row.tags.length > 0)).toBe(true);
		},
	);
	it("adapts to researched business context rather than hardcoding an AI product", () => {
		const questions = buildQuestionBank(
			{ category: "running shoes", audience: "marathon runners", useCase: "train for a marathon", language: "en" },
			"Acme",
		);
		expect(questions[0].prompt).toContain("running shoes");
		expect(questions[1].prompt).toContain("marathon runners");
		expect(questions[2].prompt).toContain("train for a marathon");
		expect(JSON.stringify(questions)).not.toContain("API");
	});
	it("generates Chinese questions for a Chinese business profile", () => {
		const questions = buildQuestionBank(categoryQuestionProfile("image", "zh"), "画图助手");
		expect(questions[0].prompt).toBe("有哪些值得考虑的AI 图片生成工具？");
		expect(questions.filter((row) => row.prompt.includes("画图助手"))).toHaveLength(3);
	});
	it("does not label brand-seeded category questions as neutral discovery", () => {
		const rows = buildQuestionBank(
			{ category: "Acme tools", audience: "Acme customers", useCase: "use Acme", language: "en" },
			"Acme",
		);
		expect(rows.every((row) => ["brand-awareness", "alternatives", "brand-fit"].includes(row.tags[0]))).toBe(true);
	});
	it("refuses unknown categories and incomplete profiles", () => {
		expect(() => categoryQuestionProfile("missing", "en")).toThrow("Choose a question category");
		expect(buildQuestionBank({ category: "", audience: "teams", useCase: "work", language: "en" }, "Acme")).toEqual([]);
	});
	it("honors zero and smaller requested limits", () => {
		expect(buildQuestionBank(categoryQuestionProfile("api", "en"), "Acme", 0)).toEqual([]);
		expect(buildQuestionBank(categoryQuestionProfile("api", "en"), "Acme", 5)).toHaveLength(5);
	});
});
