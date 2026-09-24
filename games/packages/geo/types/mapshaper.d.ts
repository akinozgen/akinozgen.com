/** mapshaper ships no types; only applyCommands is used here. */
declare module "mapshaper" {
  export function applyCommands(
    commands: string,
    input: Record<string, Buffer | string>,
  ): Promise<Record<string, Uint8Array>>;
  const mapshaper: { applyCommands: typeof applyCommands };
  export default mapshaper;
}
