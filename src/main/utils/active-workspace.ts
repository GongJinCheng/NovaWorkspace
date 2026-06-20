/**
 * Active Workspace Tracker
 *
 * Keeps track of the currently active workspace root path so that
 * IPC handlers (e.g. fs write/create/delete/rename) can validate
 * that the target path is inside the user's workspace.
 *
 * Updated by workspace.handlers.ts when WORKSPACE.OPEN succeeds.
 */

let activeWorkspaceRoot: string | null = null;

export function setActiveWorkspaceRoot(root: string): void {
  activeWorkspaceRoot = root;
}

export function getActiveWorkspaceRoot(): string | null {
  return activeWorkspaceRoot;
}
