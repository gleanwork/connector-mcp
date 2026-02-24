/**
 * Canonical Glean Document entity model — bundled as static data so tools
 * can reference it without an API call.
 *
 * Update this when Glean's entity model changes.
 */

export interface GleanField {
  name: string;
  type: string;
  required: boolean;
  description: string;
}

export const GLEAN_DOCUMENT_FIELDS: readonly GleanField[] = [
  { name: 'datasourceObjectId', type: 'string', required: true, description: 'Unique object ID within the datasource' },
  { name: 'title', type: 'string', required: true, description: 'Document title' },
  { name: 'viewURL', type: 'string', required: true, description: 'Canonical URL for viewing the document' },
  { name: 'permissions', type: 'object', required: true, description: 'Document access permissions (e.g. anonymous access flag)' },
  { name: 'body', type: 'string', required: false, description: 'Document body text (plain text or HTML)' },
  { name: 'author', type: 'string', required: false, description: 'Author name or email' },
  { name: 'createdAt', type: 'datetime', required: false, description: 'Creation timestamp (Unix seconds)' },
  { name: 'updatedAt', type: 'datetime', required: false, description: 'Last update timestamp (Unix seconds)' },
  { name: 'container', type: 'string', required: false, description: 'Parent container name (e.g. folder, channel)' },
  { name: 'mimeType', type: 'string', required: false, description: 'MIME type of the document' },
  { name: 'tags', type: 'string[]', required: false, description: 'List of tags or labels' },
] as const;

export const REQUIRED_GLEAN_FIELDS: readonly string[] = GLEAN_DOCUMENT_FIELDS
  .filter((f) => f.required)
  .map((f) => f.name);
