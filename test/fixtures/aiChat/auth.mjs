// Used only by the isolated local fixture server, never by the app build.
export const supabaseClient = { auth: { getSession: async () => ({ data: { session: { access_token: 'fixture-only-token', user: { id: 'fixture-owner' } } } }) } };
