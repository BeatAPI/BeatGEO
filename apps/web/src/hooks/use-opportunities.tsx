import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { v4 as uuid } from "uuid";
import { useResolvedBrandId } from "@/hooks/use-brand-id";
import { generateOpportunitiesFn, getOpportunitiesFn } from "@/server/opportunities-fn";

const opportunitiesKeys = {
	all: ["opportunities-report"] as const,
	detail: (brandId: string) => [...opportunitiesKeys.all, brandId] as const,
};

/** Saved recommendations are read without invoking the research provider. */
export function useOpportunities(brandId?: string) {
	const resolvedBrandId = useResolvedBrandId(brandId);
	const client = useQueryClient();

	const query = useQuery({
		queryKey: opportunitiesKeys.detail(resolvedBrandId || ""),
		queryFn: () =>
			getOpportunitiesFn({
				data: { brandId: resolvedBrandId || "", timezone: Intl.DateTimeFormat().resolvedOptions().timeZone },
			}),
		enabled: !!resolvedBrandId,
		staleTime: Number.POSITIVE_INFINITY,
		refetchOnWindowFocus: false,
		retry: false,
	});

	const generation = useMutation({
		mutationFn: () =>
			generateOpportunitiesFn({
				data: {
					brandId: resolvedBrandId || "",
					timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
					idempotencyKey: uuid(),
					expectedLastEvaluatedAt: query.data?.lastEvaluatedAt ?? null,
				},
			}),
		onSuccess: (data) => client.setQueryData(opportunitiesKeys.detail(resolvedBrandId || ""), data),
		retry: false,
	});

	return {
		data: query.data,
		isLoading: query.isLoading,
		isFetching: query.isFetching,
		error: query.error,
		refetch: query.refetch,
		generate: generation.mutate,
		isGenerating: generation.isPending,
		generationError: generation.error,
	};
}
