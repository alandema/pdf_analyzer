"""Hello World Lambda handler for PDF Analyzer API."""
import json
import os


def handler(event, context):
    """Handle API Gateway requests and return a hello world response."""
    return {
        "statusCode": 200,
        "headers": {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
            "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
            "Access-Control-Allow-Methods": "GET,OPTIONS",
        },
        "body": json.dumps({
            "message": "Hello from PDF Analyzer!",
            "environment": os.environ.get("ENVIRONMENT", "unknown"),
            "bucket": os.environ.get("PDF_BUCKET_NAME", "not-configured"),
            "table": os.environ.get("METADATA_TABLE_NAME", "not-configured"),
        }),
    }
