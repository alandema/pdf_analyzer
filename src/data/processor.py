"""Process PDF from EventBridge event and save to processed bucket."""
import os
import boto3
from datetime import datetime, timezone
import json

s3 = boto3.client('s3')

PDF_BUCKET = os.environ['PDF_BUCKET_NAME']
PROCESSED_BUCKET = os.environ['PROCESSED_BUCKET_NAME']


def handler(event, context):
    print(json.dumps(event))
    detail = event.get('detail', {})
    key = detail['key']
    user_id = detail['userId']
    file_id = detail['fileId']
    filename = detail.get('filename', 'document.pdf')

    # Read original PDF
    response = s3.get_object(Bucket=PDF_BUCKET, Key=key)
    pdf_data = response['Body'].read()

    # Build processed key: user_id/year/month/day/file_id_processed.pdf
    now = datetime.now(timezone.utc)
    processed_key = f"{user_id}/{now.year}/{now.month:02d}/{now.day:02d}/{file_id}_processed.pdf"

    # Save to processed bucket
    s3.put_object(Bucket=PROCESSED_BUCKET, Key=processed_key, Body=pdf_data, ContentType='application/pdf')

    return {'statusCode': 200, 'processedKey': processed_key}