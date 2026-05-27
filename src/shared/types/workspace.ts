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


export interface ProjectMeta {
  name: string;
  description: string;
  rootPath: string;
  createdAt: string;
  updatedAt: string;
}

export interface ProjectDocumentStat {
  totalMarkdown: number;
  totalFiles: number;
  lastEditedAt: string | null;
}

export interface ProjectTodoStat {
  total: number;
  pending: number;
  completed: number;
  overdue: number;
  today: number;
}

export interface ProjectHistoryStat {
  totalVersions: number;
  lastVersionAt: string | null;
}

export interface ProjectRecentDocument {
  name: string;
  path: string;
  relativePath: string;
  modifiedAt: string;
  size: number;
}

export interface ProjectActivityItem {
  id: string;
  type: 'document' | 'todo' | 'history' | 'project';
  title: string;
  subtitle?: string;
  targetPath?: string;
  createdAt: string;
}

export interface ProjectOverview {
  meta: ProjectMeta;
  documentStat: ProjectDocumentStat;
  todoStat: ProjectTodoStat;
  historyStat: ProjectHistoryStat;
  recentDocuments: ProjectRecentDocument[];
  activities: ProjectActivityItem[];
  ai: { providerName: string | null; model: string | null; configured: boolean };
}

export interface UpdateProjectMetaInput {
  rootPath: string;
  name?: string;
  description?: string;
}
