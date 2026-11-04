/** MCP authorization stays in the story frame instead of issuing a real grant. */
export const authClient = {
	oauth2: { consent: async () => ({ data: { redirect: true, url: "/" }, error: null }) },
};
