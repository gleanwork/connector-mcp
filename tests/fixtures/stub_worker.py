#!/usr/bin/env python3
"""
Stub JSON-RPC worker — reference implementation of the Glean Connector Worker Protocol v1.0.

Schema: https://gleanwork.github.io/connector-mcp/protocol/v1.0.json

Execution sequence (per schema):
1. Read 'execute' request from stdin
2. Send ExecuteResponse immediately (before fetching any records)
3. Send RecordFetchedNotification for each record in src/*/mock_data.json
4. Send ExecutionCompleteNotification
5. Exit
"""

import glob
import json
import sys
import time


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

        if request.get("method") != "execute":
            continue

        request_id = request.get("id")
        execution_id = "stub-execution"

        # ExecuteResponse — immediate, per schema
        emit({"jsonrpc": "2.0", "result": {"execution_id": execution_id, "status": "started"}, "id": request_id})

        matches = glob.glob("src/*/mock_data.json")
        records = []
        if matches:
            try:
                with open(matches[0]) as f:
                    records = json.load(f)
            except (OSError, json.JSONDecodeError):
                records = []

        start_ms = time.time() * 1000

        # RecordFetchedNotification per record, per schema
        for i, record in enumerate(records):
            emit({
                "method": "record_fetched",
                "params": {"record_id": f"stub-{i}", "index": i, "data": record},
            })

        duration_ms = time.time() * 1000 - start_ms

        # ExecutionCompleteNotification, per schema
        emit({
            "method": "execution_complete",
            "params": {
                "execution_id": execution_id,
                "success": True,
                "total_records": len(records),
                "successful_records": len(records),
                "failed_records": 0,
                "total_duration_ms": duration_ms,
            },
        })

        sys.exit(0)


if __name__ == "__main__":
    main()
