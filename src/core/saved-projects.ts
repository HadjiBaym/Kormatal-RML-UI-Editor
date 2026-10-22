import type { ProjectFile } from './types.ts';

export const SAVED_PROJECTS_STORAGE_KEY = 'kormatal-vacuus-saved-projects-v1';

export interface SavedProject {
  id: string;
  name: string;
  savedAt: string;
  screenName: string;
  cssPixelsAsDp: boolean;
  files: ProjectFile[];
}

export interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

function isProjectFile(value: unknown): value is ProjectFile {
  if (!value || typeof value !== 'object') return false;
  const file = value as Partial<ProjectFile>;
  return typeof file.id === 'string'
    && typeof file.path === 'string'
    && typeof file.content === 'string'
    && ['html', 'css', 'js', 'asset'].includes(String(file.type));
}

export function readSavedProjects(storage: StorageLike, key = SAVED_PROJECTS_STORAGE_KEY): SavedProject[] {
  try {
    const raw = storage.getItem(key);
    if (!raw) return [];
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((item): item is SavedProject => {
      if (!item || typeof item !== 'object') return false;
      const project = item as Partial<SavedProject>;
      return typeof project.id === 'string'
        && typeof project.name === 'string'
        && typeof project.screenName === 'string'
        && typeof project.savedAt === 'string'
        && typeof project.cssPixelsAsDp === 'boolean'
        && Array.isArray(project.files)
        && project.files.every(isProjectFile);
    }).map(project => ({ ...project, files: project.files.map(file => ({ ...file })) }));
  } catch {
    return [];
  }
}

export function writeSavedProject(storage: StorageLike, project: SavedProject, key = SAVED_PROJECTS_STORAGE_KEY): SavedProject[] {
  const projects = readSavedProjects(storage, key);
  const normalized: SavedProject = {
    ...project,
    name: project.name.trim(),
    savedAt: project.savedAt || new Date().toISOString(),
    files: project.files.map(file => ({ ...file })),
  };
  if (!normalized.name) throw new Error('Укажите название проекта.');
  if (normalized.files.length === 0) throw new Error('Нельзя сохранить пустой проект. Сначала добавьте или импортируйте файлы.');
  const existingIndex = projects.findIndex(item => item.id === normalized.id);
  if (existingIndex >= 0) projects[existingIndex] = normalized;
  else projects.unshift(normalized);
  storage.setItem(key, JSON.stringify(projects));
  return projects;
}
