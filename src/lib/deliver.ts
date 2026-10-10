import { Readable } from 'node:stream';
import type { defineOperationApi } from '@directus/extensions-sdk';

type OperationContext = Parameters<Parameters<typeof defineOperationApi>[0]['handler']>[1];

/** The part of the Directus operation handler context we rely on. */
export type DirectusContext = Pick<
  OperationContext,
  'services' | 'getSchema' | 'database' | 'accountability' | 'env'
>;

export interface FilePayload {
  buffer: Buffer;
  filename: string;
  contentType: string;
  folder?: string | null;
}

/**
 * Import a generated file into Directus storage via FilesService and return the
 * new file's primary key. Uses the first configured storage location.
 */
export async function saveToDirectusFile(
  context: DirectusContext,
  file: FilePayload,
): Promise<string | number> {
  const { services, getSchema, database, accountability, env } = context;
  const { FilesService } = services;

  const schema = await getSchema();
  const filesService = new FilesService({ schema, knex: database, accountability });

  const storage =
    (env.STORAGE_LOCATIONS ? String(env.STORAGE_LOCATIONS).split(',')[0].trim() : 'local') ||
    'local';

  return filesService.uploadOne(Readable.from(file.buffer), {
    title: file.filename,
    filename_download: file.filename,
    type: file.contentType,
    storage,
    folder: file.folder ?? null,
  });
}
