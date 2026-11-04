import { useCallback } from "react";

export function useWriteErrorMessage(): (error: unknown, fallback: string) => string {
	return useCallback((error: unknown, fallback: string) => {
		const message = error instanceof Error ? error.message : "";
		return message || fallback;
	}, []);
}
