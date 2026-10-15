import { useQuery } from "@tanstack/react-query";
import { Skeleton } from "@workspace/ui/components/skeleton";
import FullPageCard from "@/components/full-page-card";
import { OrganizationDirectory } from "@/components/organization-directory";
import { useT } from "@/lib/i18n";
import { organizationsQuery } from "@/lib/organizations/queries";

const TITLE = "404 Not Found";
const SUBTITLE = "That page doesn't exist or moved.";

export function NotFoundPage() {
	const t = useT();
	const { data, isLoading } = useQuery(organizationsQuery);

	if (isLoading) {
		return (
			<FullPageCard title={t(TITLE)} subtitle={t(SUBTITLE)}>
				<div className="flex min-w-[240px] flex-col space-y-3">
					<Skeleton className="h-10 w-full" />
					<Skeleton className="h-10 w-full" />
				</div>
			</FullPageCard>
		);
	}

	if (!data?.signedIn) {
		return <FullPageCard title={t(TITLE)} subtitle={t(SUBTITLE)} showBackButton={true} />;
	}

	return (
		<FullPageCard
			logoHref="/app"
			title={t(TITLE)}
			subtitle={t(SUBTITLE)}
			showBackButton={data.organizations.length === 0}
		>
			{data.organizations.length > 0 ? <OrganizationDirectory organizations={data.organizations} /> : undefined}
		</FullPageCard>
	);
}
