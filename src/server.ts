import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { createConnectorSchema, handleCreateConnector } from './tools/create-connector.js';
import {
  inferSchemaSchema,
  getSchemaSchema,
  updateSchemaSchema,
  analyzeFieldSchema,
  handleInferSchema,
  handleGetSchema,
  handleUpdateSchema,
  handleAnalyzeField,
} from './tools/schema.js';
import { getProjectPath } from './session.js';

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'glean-connector',
    version: '0.1.0',
  });

  server.registerTool(
    'create_connector',
    {
      description:
        'Create a new Glean connector project using the standard template. ' +
        'Run this first. Sets the active project directory for this session.',
      inputSchema: createConnectorSchema,
    },
    handleCreateConnector,
  );

  server.registerTool(
    'infer_schema',
    {
      description:
        'Parse a data file (.csv, .json, .ndjson) and return field analysis: ' +
        'detected types, null rates, cardinality, and sample values. ' +
        'Use this to understand the source data before defining mappings.',
      inputSchema: inferSchemaSchema,
    },
    (params) => handleInferSchema(params, getProjectPath()),
  );

  server.registerTool(
    'get_schema',
    {
      description: 'Read the current field schema from .glean/schema.json.',
      inputSchema: getSchemaSchema,
    },
    (params) => handleGetSchema(params, getProjectPath()),
  );

  server.registerTool(
    'update_schema',
    {
      description:
        'Write field definitions to .glean/schema.json. ' +
        'Call this after infer_schema to save the agreed schema, or to make manual edits.',
      inputSchema: updateSchemaSchema,
    },
    (params) => handleUpdateSchema(params, getProjectPath()),
  );

  server.registerTool(
    'analyze_field',
    {
      description:
        'Deep-dive on a single field from the current schema: samples, type details, ' +
        'and Glean mapping suggestions.',
      inputSchema: analyzeFieldSchema,
    },
    (params) => handleAnalyzeField(params, getProjectPath()),
  );

  return server;
}
