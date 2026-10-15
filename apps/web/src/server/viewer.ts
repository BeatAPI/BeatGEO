import { createServerFn } from "@tanstack/react-start";
import { canManageConnections, getAuthSession, hasReportAccess, isAdmin } from "@/lib/auth/helpers";

export interface Viewer {
	session: NonNullable<Awaited<ReturnType<typeof getAuthSession>>>;
	isAdmin: boolean;
	canManageConnections?: boolean;
	hasReportAccess: boolean;
}

export const getViewerFn = createServerFn({ method: "GET" }).handler(async (): Promise<Viewer | null> => {
	const session = await getAuthSession();
	if (!session) return null;
	return {
		session,
		isAdmin: isAdmin(session),
		hasReportAccess: hasReportAccess(session),
		canManageConnections: await canManageConnections(session),
	};
});
