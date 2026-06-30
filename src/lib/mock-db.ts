// Compatibility shim — routes import from here for now, but real source
// is src/repositories/. New code SHOULD import from "@/repositories" directly.

export {
  getCurrentUser as _getCurrentUser,
  listProjects,
  getProject,
  listDrawings,
  getDrawing,
  listIssues,
} from "@/repositories";

import { getCurrentUser } from "@/repositories";
export const CURRENT_USER = getCurrentUser();
