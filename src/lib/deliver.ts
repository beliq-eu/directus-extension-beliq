import { Readable } from 'node:stream';

/** Minimal shape of the Directus operation handler context we rely on. */
export interface DirectusContext {
  services: any;
  getSchema: () => Promise<any>;
  database: any;
  accountability: any;
  env: Record<string, any>;
}

export interface FilePayload {
  buffer: Buffer;
  filename: string;
  contentType: string;
  folder?: string | null;
}

/**
 * Import a generated file into Directus storage via FilesService and return the
 * new file's primary key (UUID). Uses the first configured storage location.
 */
export async function saveToDirectusFile(
  context: DirectusContext,
  file: FilePayload,
): Promise<string> {
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
