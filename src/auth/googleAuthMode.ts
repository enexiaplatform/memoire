/** GIS is used only on its configured application origin. Other origins use
 * Supabase's provider redirect; they do not need separate GIS registration. */
export function useGoogleRedirect(origin: string, configuredAppUrl: string): boolean {
  try { return new URL(configuredAppUrl).origin !== origin; }
  catch { return true; }
}
