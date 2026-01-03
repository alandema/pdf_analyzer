import json
import os
from datetime import timezone, datetime

import boto3
from boto3.dynamodb.conditions import Key
from decimal import Decimal
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), '.env'), override=False)


# DynamoDB resource is used for convenient querying
dynamodb = boto3.resource('dynamodb')
s3 = boto3.client('s3')


def convert_decimal(obj):
    if isinstance(obj, list):
        return [convert_decimal(item) for item in obj]
    elif isinstance(obj, dict):
        return {k: convert_decimal(v) for k, v in obj.items()}
    elif isinstance(obj, Decimal):
        if obj % 1 == 0:
            return int(obj)
        else:
            return float(obj)
    else:
        return obj

PROCESSED_PDF_BUCKET_NAME = os.environ.get('PROCESSED_PDF_BUCKET_NAME', '')
PDFS_TABLE_NAME = os.environ.get('PDFS_TABLE_NAME', '')
URL_EXPIRY_SECONDS = int(os.environ.get('URL_EXPIRY_SECONDS', '900'))


CORS_HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "GET,OPTIONS",
}


def _response(status_code: int, body_obj: object):
    return {
        "statusCode": status_code,
        "headers": CORS_HEADERS,
        "body": json.dumps(body_obj),
    }


def _get_user_id(event) -> str | None:
    claims = event.get('requestContext', {}).get('authorizer', {}).get('claims', {})
    return claims.get('sub')

def handler(event, context):
    print(json.dumps(event))

    if not PROCESSED_PDF_BUCKET_NAME:
        return _response(500, {"error": "PROCESSED_PDF_BUCKET_NAME is not configured"})

    if event.get('httpMethod') == 'OPTIONS':
        return {"statusCode": 200, "headers": CORS_HEADERS, "body": ""}

    user_id = _get_user_id(event)
    if not user_id:
        return _response(401, {"error": "Unauthorized"})

    # Query DynamoDB for all PDFs for this user
    table = dynamodb.Table(PDFS_TABLE_NAME)
    try:
        resp = table.query(KeyConditionExpression=Key('user_id').eq(user_id))
    except Exception as e:
        print('DynamoDB query failed:', e)
        return _response(500, {"error": "Failed to query PDFs table"})

    items = convert_decimal(resp.get('Items', []))

    files = []
    for item in items:
        filename = item.get('filename')
        uploaded_at = item.get('uploaded_at')
        processed_at = item.get('processed_at')
        processed_s3_uri = item.get('processed_s3_uri')
        pdf_id = item.get('pdf_id')

        url = None
        if processed_s3_uri:
            try:
                # Expect format s3://bucket/key
                uri = processed_s3_uri
                if uri.startswith('s3://'):
                    _, rest = uri.split('s3://', 1)
                    bucket, key = rest.split('/', 1)
                else:
                    # Fallback to configured processed bucket
                    bucket = PROCESSED_PDF_BUCKET_NAME
                    key = uri

                url = s3.generate_presigned_url(
                    'get_object',
                    Params={
                        'Bucket': bucket,
                        'Key': key,
                        'ResponseContentDisposition': f'attachment; filename="{filename}"',
                    },
                    ExpiresIn=URL_EXPIRY_SECONDS,
                )
            except Exception as e:
                print('Failed to generate presigned URL for', processed_s3_uri, e)
                url = None

        files.append({
            "pdfId": pdf_id,
            "name": filename,
            "status": item.get('status', 'unknown'),
            "uploadedAt": uploaded_at,
            "processedAt": processed_at,
            "url": url,
        })

    # Sort by uploadedAt (ISO string) descending
    files = sorted(files, key=lambda f: f.get('uploadedAt') or '', reverse=True)

    return _response(200, {"files": files})
