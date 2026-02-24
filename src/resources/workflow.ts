export const WORKFLOW_GUIDE = `
# Glean Connector Authoring Workflow

Follow these steps in order. Each step uses a specific MCP tool.

## Step 1: Create the project
\`create_connector\` — scaffolds the directory structure and sets the active project.

## Step 2: Configure the connector
Have a conversation about the data source: what system it comes from, how to authenticate, whether it supports pagination, rate limits. Then call \`set_config\` with the agreed configuration.

## Step 3: Define the schema
If you have a sample data file (.csv, .json, .ndjson): call \`infer_schema\` with the file path to get field analysis.
If not: describe the fields and call \`update_schema\` directly with the field definitions.

## Step 4: Map fields to Glean's entity model
Call \`get_mappings\` — this shows your source schema alongside Glean's entity model.
Decide which source field maps to which Glean field.
Call \`confirm_mappings\` with the mapping decisions.
Call \`validate_mappings\` to verify all required Glean fields are covered.

## Step 5: Build the connector
Call \`build_connector\` with \`dry_run: true\` first to review the generated code.
If it looks correct, call \`build_connector\` with \`dry_run: false\` to write the files.

## Step 6: Run and inspect
Call \`run_connector\` — returns an \`execution_id\` immediately.
Call \`inspect_execution\` with that ID to check status, see records, and review validation results.
If records have issues, return to Step 3 or 4 to refine schema/mappings, then rebuild and rerun.
`.trim();
