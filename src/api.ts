import { defineOperationApi } from '@directus/extensions-sdk';
import type {
  ConvertTargetFormat,
  FacturxProfile,
  GenerateProfile,
  Invoice,
  ParseFormat,
  Standard,
  ValidateFormat,
} from '@beliq/sdk';
import { asJsonObject, createClient, mapError } from './lib/beliq.js';
import { saveToDirectusFile } from './lib/deliver.js';

type Options = Record<string, any>;

const FILE_EXTENSIONS: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/xml': 'xml',
  'text/xml': 'xml',
};

/** Pick a filename for a delivered document from its content type. */
function defaultFilename(prefix: string, contentType: string): string {
  const base = contentType.split(';')[0].trim().toLowerCase();
  const ext = FILE_EXTENSIONS[base] ?? 'bin';
  return `${prefix}.${ext}`;
}

export default defineOperationApi<Options>({
  id: 'beliq',
  handler: async (options, context) => {
    const { services, getSchema, database, accountability, env } = context as any;

    const apiKey = (options.apiKey as string) || (env.BELIQ_API_KEY as string) || '';
    if (!apiKey) {
      throw new Error(
        'beliq: no API key. Set the API Key option or the BELIQ_API_KEY environment variable.',
      );
    }

    const beliq = createClient(apiKey);
    const operation = (options.operation as string) ?? 'generate';
    const deliveryMode = (options.deliveryMode as string) ?? 'directusFile';

    try {
      if (operation === 'validate') {
        return await beliq.validate(String(options.validateDocument ?? ''), {
          format: (options.validateFormat as ValidateFormat) || undefined,
        });
      }

      if (operation === 'parse') {
        return await beliq.parse(String(options.parseDocument ?? ''), {
          format: (options.parseFormat as ParseFormat) || undefined,
        });
      }

      if (operation === 'generate') {
        const result = await beliq.generate({
          standard: options.standard as Standard,
          invoice: (asJsonObject(options.invoice) ?? {}) as Invoice,
          output: (options.output as 'xml' | 'pdf') || 'xml',
          profile: (options.profile as GenerateProfile) || undefined,
          pdfTemplateId: (options.pdfTemplateId as string) || undefined,
        });

        if ((options.output as string) !== 'pdf') {
          return {
            xml: result.xml,
            contentType: result.contentType,
            ...result.meta,
          };
        }

        return await deliver(
          { services, getSchema, database, accountability, env },
          deliveryMode,
          {
            bytes: result.bytes,
            contentType: result.contentType,
            filename: defaultFilename('invoice', result.contentType),
            folder: options.folder || null,
            meta: { ...result.meta },
          },
        );
      }

      if (operation === 'convert') {
        const result = await beliq.convert(String(options.convertDocument ?? ''), {
          targetFormat: options.targetFormat as ConvertTargetFormat,
          targetProfile: (options.convertProfile as FacturxProfile) || undefined,
        });

        return await deliver(
          { services, getSchema, database, accountability, env },
          deliveryMode,
          {
            bytes: result.bytes,
            contentType: result.contentType,
            filename: defaultFilename('converted', result.contentType),
            folder: options.folder || null,
            meta: {
              lostElements: result.meta.lostElements,
              lostElementsCount: result.meta.lostElementsCount,
            },
          },
        );
      }

      throw new Error(`beliq: unknown operation "${operation}".`);
    } catch (error) {
      throw mapError(error);
    }
  },
});

interface DeliverPayload {
  bytes: Uint8Array;
  contentType: string;
  filename: string;
  folder: string | null;
  meta: Record<string, unknown>;
}

/** Return delivered bytes as a saved Directus file or inline base64. */
async function deliver(
  context: {
    services: any;
    getSchema: () => Promise<any>;
    database: any;
    accountability: any;
    env: Record<string, any>;
  },
  deliveryMode: string,
  payload: DeliverPayload,
): Promise<Record<string, unknown>> {
  const buffer = Buffer.from(payload.bytes);
  const sizeBytes = buffer.length;

  if (deliveryMode === 'base64') {
    return {
      base64: buffer.toString('base64'),
      filename: payload.filename,
      contentType: payload.contentType,
      sizeBytes,
      ...payload.meta,
    };
  }

  const fileId = await saveToDirectusFile(context, {
    buffer,
    filename: payload.filename,
    contentType: payload.contentType,
    folder: payload.folder,
  });

  return {
    fileId,
    filename: payload.filename,
    contentType: payload.contentType,
    sizeBytes,
    ...payload.meta,
  };
}
