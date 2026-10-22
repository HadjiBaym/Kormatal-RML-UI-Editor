import test from 'node:test';
import assert from 'node:assert/strict';
import { readSavedProjects, writeSavedProject, SAVED_PROJECTS_STORAGE_KEY, type StorageLike } from '../saved-projects.ts';
import type { ProjectFile } from '../types.ts';
import { PRESET_PROJECTS } from '../presets.ts';

class MemoryStorage implements StorageLike {
  data = new Map<string, string>();
  getItem(key: string) { return this.data.get(key) ?? null; }
  setItem(key: string, value: string) { this.data.set(key, value); }
}

const file: ProjectFile = { id: 'html-1', path: 'index.html', type: 'html', content: '<html></html>' };
const project = { id: 'project-1', name: 'LAMGUARD', savedAt: '2026-10-18T00:00:00.000Z', screenName: 'MainMenu', cssPixelsAsDp: false, files: [file] };

test('saved projects storage starts empty and reads persisted projects', () => {
  const storage = new MemoryStorage();
  assert.deepEqual(readSavedProjects(storage), []);
  writeSavedProject(storage, project);
  assert.equal(readSavedProjects(storage)[0].name, 'LAMGUARD');
});

test('saving the same id updates the project instead of duplicating it', () => {
  const storage = new MemoryStorage();
  writeSavedProject(storage, project);
  writeSavedProject(storage, { ...project, name: 'LAMGUARD Main Menu' });
  const projects = readSavedProjects(storage);
  assert.equal(projects.length, 1);
  assert.equal(projects[0].name, 'LAMGUARD Main Menu');
});

test('invalid storage data safely returns an empty list', () => {
  const storage = new MemoryStorage();
  storage.setItem(SAVED_PROJECTS_STORAGE_KEY, '{bad json');
  assert.deepEqual(readSavedProjects(storage), []);
});

test('empty projects cannot be saved', () => {
  const storage = new MemoryStorage();
  assert.throws(() => writeSavedProject(storage, { ...project, files: [] }), /Нельзя сохранить пустой проект/);
});

test('demo presets are empty by default', () => {
  assert.deepEqual(PRESET_PROJECTS, []);
});
