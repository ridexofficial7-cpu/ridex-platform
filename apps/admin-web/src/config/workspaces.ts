import type { Screen } from "../types";
import { WORKSPACES } from "../lib/api";

export const WORKSPACE_SCREENS = Object.keys(WORKSPACES) as Screen[];
export { WORKSPACES };
