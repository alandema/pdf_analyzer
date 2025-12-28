import numpy as np
import json

def lambda_handler(event, context):
    return {
        "statusCode": 200,
        "body": json.dumps({
            "message": "Hello from PDF Analyzer!"
        }),
    }