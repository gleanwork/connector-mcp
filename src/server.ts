import { createRequire } from 'node:module';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';

import { getStartedSchema, handleGetStarted } from './tools/get-started.js';
import {
  createConnectorSchema,
  handleCreateConnector,
} from './tools/create-connector.js';
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
import {
  getMappingsSchema,
  confirmMappingsSchema,
  validateMappingsSchema,
  handleGetMappings,
  handleConfirmMappings,
  handleValidateMappings,
} from './tools/mapping.js';
import {
  getConfigSchema,
  setConfigSchema,
  handleGetConfig,
  handleSetConfig,
} from './tools/config.js';
import { buildConnectorSchema, handleBuildConnector } from './tools/build.js';
import {
  runConnectorSchema,
  inspectExecutionSchema,
  manageRecordingSchema,
  handleRunConnector,
  handleInspectExecution,
  handleManageRecording,
} from './tools/execution.js';
import { WORKFLOW_GUIDE } from './resources/workflow.js';
import { getProjectPath } from './session.js';

const require = createRequire(import.meta.url);
const pkg = require('../package.json') as { version: string };

export function createServer(): McpServer {
  const server = new McpServer({
    name: 'glean-connector-mcp',
    version: pkg.version,
  });

  server.registerTool(
    'get_started',
    {
      description:
        'Start building a Glean connector. Returns an opening prompt that orients the AI ' +
        'and asks the user what data source they want to connect. Call this first.',
      inputSchema: getStartedSchema,
    },
    handleGetStarted,
  );

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

  server.registerTool(
    'get_mappings',
    {
      description:
        'Return the current source schema alongside the Glean entity model so you can ' +
        'decide which source field maps to which Glean field.',
      inputSchema: getMappingsSchema,
    },
    (params) => handleGetMappings(params, getProjectPath()),
  );

  server.registerTool(
    'confirm_mappings',
    {
      description:
        'Save field mapping decisions to .glean/mappings.json. ' +
        'Merges with any existing mappings.',
      inputSchema: confirmMappingsSchema,
    },
    (params) => handleConfirmMappings(params, getProjectPath()),
  );

  server.registerTool(
    'validate_mappings',
    {
      description:
        "Check current mappings against Glean's entity model. " +
        'Reports missing required fields and type mismatches.',
      inputSchema: validateMappingsSchema,
    },
    (params) => handleValidateMappings(params, getProjectPath()),
  );

  server.registerTool(
    'get_config',
    {
      description:
        'Read the current connector configuration from .glean/config.json.',
      inputSchema: getConfigSchema,
    },
    (params) => handleGetConfig(params, getProjectPath()),
  );

  server.registerTool(
    'set_config',
    {
      description:
        'Write connector configuration to .glean/config.json. ' +
        'Merges with existing config. ' +
        'Code-generation keys (consumed by build_connector): name, display_name, ' +
        'datasource_category, url_regex, icon_url, connector_type. ' +
        'Runtime-only keys (used by the connector at execution time, not during code generation): ' +
        'auth_type, endpoint, api_key_header, page_size, rate_limit_rps.',
      inputSchema: setConfigSchema,
    },
    (params) => handleSetConfig(params, getProjectPath()),
  );

  server.registerTool(
    'build_connector',
    {
      description:
        'Generate Python connector files from schema + mappings + config. ' +
        'Use dry_run: true to preview the generated code without writing files.',
      inputSchema: buildConnectorSchema,
    },
    (params) => handleBuildConnector(params, getProjectPath()),
  );

  server.registerTool(
    'run_connector',
    {
      description:
        'Start async execution of the Python connector. Returns an execution_id immediately. ' +
        'Poll status with inspect_execution.',
      inputSchema: runConnectorSchema,
    },
    (params) => handleRunConnector(params, getProjectPath()),
  );

  server.registerTool(
    'inspect_execution',
    {
      description:
        'Check execution status and retrieve records. Returns status, records fetched, ' +
        'per-record validation results, and recent logs.',
      inputSchema: inspectExecutionSchema,
    },
    (params) => handleInspectExecution(params, getProjectPath()),
  );

  server.registerTool(
    'manage_recording',
    {
      description:
        'Manage connector recordings. ' +
        'action: "record" saves fetched data, "replay" runs from a saved file, ' +
        '"list" shows available recordings, "delete" removes one.',
      inputSchema: manageRecordingSchema,
    },
    (params) => handleManageRecording(params, getProjectPath()),
  );

  // ── Resources ─────────────────────────────────────────────────

  server.registerResource(
    'connector://workflow',
    'connector://workflow',
    {
      description:
        'Step-by-step guide for authoring a Glean connector with these MCP tools',
      mimeType: 'text/markdown',
    },
    async () => ({
      contents: [
        {
          uri: 'connector://workflow',
          text: WORKFLOW_GUIDE,
          mimeType: 'text/markdown',
        },
      ],
    }),
  );

  return server;
}
