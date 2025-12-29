import json
import boto3

def handler(event, context):
    print(json.dumps(event))
    return {
        "statusCode": 200,
        "body": json.dumps({
            "message": "Hello from PDF Analyzer!"
        }),
    }