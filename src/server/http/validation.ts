import { z } from 'zod';

export class RequestValidationError extends Error {
  readonly issues: z.ZodIssue[];

  constructor(issues: z.ZodIssue[]) {
    super('Request validation failed.');
    this.name = 'RequestValidationError';
    this.issues = issues;
  }
}

export async function parseJson<TSchema extends z.ZodTypeAny>(
  request: Request,
  schema: TSchema,
): Promise<z.infer<TSchema>> {
  let body: unknown;

  try {
    body = await request.json();
  } catch {
    throw new RequestValidationError([
      {
        code: z.ZodIssueCode.custom,
        path: [],
        message: 'Request body must be valid JSON.',
      },
    ]);
  }

  const parsed = schema.safeParse(body);
  if (!parsed.success) throw new RequestValidationError(parsed.error.issues);
  return parsed.data;
}

export function parseSearchParams<TSchema extends z.ZodTypeAny>(
  request: Request,
  schema: TSchema,
): z.infer<TSchema> {
  const url = new URL(request.url);
  const values = Object.fromEntries(url.searchParams.entries());
  const parsed = schema.safeParse(values);
  if (!parsed.success) throw new RequestValidationError(parsed.error.issues);
  return parsed.data;
}
