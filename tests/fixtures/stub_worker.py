#!/usr/bin/env python3
"""
Stub JSON-RPC worker for E2E testing.

Speaks the exact protocol the MCP server's WorkerPool expects:
- Reads a "run" JSON-RPC request from stdin
- Finds mock_data.json in src/*/mock_data.json relative to cwd
- Emits each record as a {"method":"record","params":{...}} notification
- Emits {"method":"complete"} notification
- Sends the JSON-RPC success response and exits
"""

import glob
import json
import sys


def emit(obj):
    print(json.dumps(obj), flush=True)


def main():
    for line in sys.stdin:
        line = line.strip()
        if not line:
            continue
        try:
            request = json.loads(line)
        except json.JSONDecodeError:
            continue

        if request.get("method") != "run":
            continue

        request_id = request.get("id")

        # Find mock_data.json in src/*/mock_data.json relative to cwd
        matches = glob.glob("src/*/mock_data.json")
        records = []
        if matches:
            try:
                with open(matches[0]) as f:
                    records = json.load(f)
            except (OSError, json.JSONDecodeError):
                records = []

        # Emit each record as a notification (no "id" field)
        for record in records:
            emit({"method": "record", "params": record})

        # Emit complete notification
        emit({"method": "complete"})

        # Send JSON-RPC success response
        emit({"jsonrpc": "2.0", "result": {}, "id": request_id})
        sys.exit(0)


if __name__ == "__main__":
    main()
