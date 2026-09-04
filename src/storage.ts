import fs from 'node:fs/promises';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Draft } from './types.js';
import { draftListSchema } from '../shared/schemas.js';

const dataDirectory = path.resolve('data');
const classificationFile = path.join(dataDirectory, 'classifications.json');
const draftFile = path.join(dataDirectory, 'drafts.json');

async function readJson<T>(file: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await fs.readFile(file, 'utf8')) as T;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') return fallback;
    throw error;
  }
}

async function writeJson(file: string, value: unknown): Promise<void> {
  await fs.mkdir(dataDirectory, { recursive: true });
  const temporary = `${file}.${randomUUID()}.tmp`;
  await fs.writeFile(temporary, JSON.stringify(value, null, 2), 'utf8');
  await fs.rename(temporary, file);
}

export const classificationStore = {
  async all(): Promise<Record<string, string>> {
    return readJson(classificationFile, {});
  },
  async remember(merchantKey: string, category: string): Promise<Record<string, string>> {
    const values = await this.all();
    values[merchantKey] = category;
    await writeJson(classificationFile, values);
    return values;
  },
};

export const draftStore = {
  async all(): Promise<Draft[]> {
    return draftListSchema.parse(await readJson<unknown>(draftFile, []));
  },
  async save(draft: Draft): Promise<Draft> {
    const drafts = await this.all();
    const now = new Date().toISOString();
    const saved: Draft = {
      ...draft,
      id: draft.id || randomUUID(),
      name: String(draft.name || `초안 ${new Date().toLocaleString('ko-KR')}`).trim(),
      updatedAt: now,
      createdAt: draft.createdAt || now,
    };
    const existing = drafts.findIndex(({ id }) => id === saved.id);
    if (existing >= 0) drafts[existing] = saved;
    else drafts.unshift(saved);
    await writeJson(draftFile, drafts);
    return saved;
  },
  async remove(id: string): Promise<boolean> {
    const drafts = await this.all();
    const filtered = drafts.filter((draft) => draft.id !== id);
    await writeJson(draftFile, filtered);
    return filtered.length !== drafts.length;
  },
};
