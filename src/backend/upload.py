"""Upload PDF to S3 and trigger EventBridge event."""
import json
import os
import uuid
import base64
from datetime import datetime, timezone
import boto3

s3 = boto3.client('s3')
dynamodb = boto3.resource('dynamodb')
events = boto3.client('events')

BUCKET_NAME = os.environ['PDF_BUCKET_NAME']
USER_QUOTA_TABLE_NAME = os.environ['USER_QUOTA_TABLE_NAME']
NEW_USER_QUOTA = int(os.environ.get('NEW_USER_QUOTA', '10'))
EVENT_BUS_NAME = os.environ['EVENT_BUS_NAME']

CORS_HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,Authorization",
    "Access-Control-Allow-Methods": "POST,OPTIONS",
}


def check_quota(user_id):
    """Check/create quota. Returns (allowed, remaining)."""
    table = dynamodb.Table(USER_QUOTA_TABLE_NAME)
    resp = table.get_item(Key={'userId': user_id})
    
    if 'Item' not in resp:
        now = datetime.now(timezone.utc).isoformat()
        table.put_item(Item={'userId': user_id, 'uploadCount': 0, 'uploadLimit': NEW_USER_QUOTA, 'createdAt': now})
        return True, NEW_USER_QUOTA
    
    item = resp['Item']
    remaining = int(item.get('uploadLimit', 10)) - int(item.get('uploadCount', 0))
    return remaining > 0, max(0, remaining)


def handler(event, context):
    try:
        claims = event.get('requestContext', {}).get('authorizer', {}).get('claims', {})
        user_id = claims.get('sub')
        if not user_id:
            return {"statusCode": 401, "headers": CORS_HEADERS, "body": json.dumps({"error": "Unauthorized"})}

        allowed, remaining = check_quota(user_id)
        if not allowed:
            return {"statusCode": 403, "headers": CORS_HEADERS, "body": json.dumps({"error": "Quota exceeded", "remaining": remaining})}

        body = json.loads(event.get('body', '{}'))
        filename = body.get('filename', 'document.pdf')
        file_data = base64.b64decode(body.get('file', ''))
        
        if not file_data:
            return {"statusCode": 400, "headers": CORS_HEADERS, "body": json.dumps({"error": "No file provided"})}

        # Build S3 key: user_id/year/month/day/file_id.pdf
        now = datetime.now(timezone.utc)
        file_id = str(uuid.uuid4())
        key = f"{user_id}/{now.year}/{now.month:02d}/{now.day:02d}/{file_id}.pdf"

        s3.put_object(Bucket=BUCKET_NAME, Key=key, Body=file_data, ContentType='application/pdf')
        
        # Increment quota
        dynamodb.Table(USER_QUOTA_TABLE_NAME).update_item(
            Key={'userId': user_id},
            UpdateExpression='SET uploadCount = uploadCount + :inc',
            ExpressionAttributeValues={':inc': 1}
        )

        # Publish event
        events.put_events(Entries=[{
            'Source': 'pdf-analyzer',
            'DetailType': 'PDF_UPLOADED',
            'EventBusName': EVENT_BUS_NAME,
            'Detail': json.dumps({'bucket': BUCKET_NAME, 'key': key, 'userId': user_id, 'fileId': file_id, 'filename': filename}),
        }])

        return {"statusCode": 200, "headers": CORS_HEADERS, "body": json.dumps({"fileId": file_id, "key": key, "remaining": remaining - 1})}
    except Exception as e:
        return {"statusCode": 500, "headers": CORS_HEADERS, "body": json.dumps({"error": str(e)})}
