import React, { useEffect, useState } from 'react';
import { FolderOpen, Save, X } from 'lucide-react';

interface SaveProjectModalProps {
  isOpen: boolean;
  initialName: string;
  isUpdating: boolean;
  onClose: () => void;
  onSave: (name: string) => string | null;
}

export const SaveProjectModal: React.FC<SaveProjectModalProps> = ({ isOpen, initialName, isUpdating, onClose, onSave }) => {
  const [name, setName] = useState(initialName);
  const [error, setError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setName(initialName);
      setError('');
    }
  }, [isOpen, initialName]);

  if (!isOpen) return null;

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    const result = onSave(name.trim());
    if (result) setError(result);
  };

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/70 p-2 backdrop-blur-sm sm:p-4" onMouseDown={event => { if (event.target === event.currentTarget) onClose(); }}>
      <form role="dialog" aria-modal="true" onSubmit={submit} className="ui-modal-panel w-full max-w-md overflow-hidden rounded-xl border border-zinc-700 bg-zinc-950 shadow-2xl" aria-labelledby="save-project-title">
        <div className="flex items-center justify-between border-b border-zinc-800 px-5 py-4">
          <div className="flex items-center gap-2.5">
            <span className="flex h-9 w-9 items-center justify-center rounded-lg bg-cyan-950 text-cyan-300"><FolderOpen className="h-5 w-5" /></span>
            <div>
              <h2 id="save-project-title" className="text-sm font-semibold text-zinc-100">Сохранить проект</h2>
              <p className="text-[11px] text-zinc-500">Файлы и настройки сохранятся в этом браузере</p>
            </div>
          </div>
          <button type="button" onClick={onClose} className="rounded p-1 text-zinc-500 hover:bg-zinc-800 hover:text-white" aria-label="Закрыть"><X className="h-4 w-4" /></button>
        </div>
        <div className="space-y-2 px-5 py-5">
          <label htmlFor="saved-project-name" className="block text-xs font-medium text-zinc-300">Название проекта</label>
          <input id="saved-project-name" autoFocus value={name} onChange={event => { setName(event.target.value); setError(''); }} maxLength={80} className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 outline-none focus:border-cyan-500" placeholder="Например, LAMGUARD Main Menu" />
          {error && <p role="alert" className="text-xs text-rose-300">{error}</p>}
        </div>
        <div className="modal-footer-actions flex flex-wrap justify-end gap-2 border-t border-zinc-800 bg-zinc-900/50 px-4 py-3 sm:px-5">
          <button type="button" onClick={onClose} className="rounded-md border border-zinc-700 px-3 py-2 text-xs text-zinc-300 hover:bg-zinc-800">Отмена</button>
          <button type="submit" disabled={!name.trim()} className="flex items-center gap-2 rounded-md bg-cyan-600 px-3 py-2 text-xs font-semibold text-white hover:bg-cyan-500 disabled:cursor-not-allowed disabled:opacity-50"><Save className="h-3.5 w-3.5" />{isUpdating ? 'Обновить сохранение' : 'Сохранить'}</button>
        </div>
      </form>
    </div>
  );
};
