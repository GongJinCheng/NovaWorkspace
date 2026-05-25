/** Workspace related types. A workspace is a project folder plus its persisted UI state. */

export interface Workspace {
  id: string;
  name: string;
  rootPath: string;
  createdAt: string;
  updatedAt: string;
  lastOpened: string;
}

export interface WorkspaceSession {
  workspaceId: string;
  rootPath: string;
  openTabs: string[];
  activeFilePath: string | null;
  selectedFolderPath: string | null;
  favorites: string[];
  updatedAt: string;
}

export interface OpenWorkspaceInput {
  rootPath: string;
  name?: string;
}

export interface SaveWorkspaceSessionInput {
  rootPath: string;
  openTabs: string[];
  activeFilePath: string | null;
  selectedFolderPath: string | null;
  favorites: string[];
}
