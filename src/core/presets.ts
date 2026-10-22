import type { ProjectFile } from './types.ts';

export interface PresetProject {
  id: string;
  name: string;
  description: string;
  screenName: string;
  files: ProjectFile[];
}

// По умолчанию список демонстрационных пресетов пуст. Пользовательские проекты
// отображаются в селекторе шапки после сохранения через «Сохранить проект».
export const PRESET_PROJECTS: PresetProject[] = [];
