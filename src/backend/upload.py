"""Generate presigned URL for PDF upload to S3 with quota enforcement."""
import json
import os
import uuid
from datetime import datetime, timezone
from decimal import Decimal
import boto3
from botocore.config import Config

s3_client = boto3.client('s3', config=Config(signature_version='s3v4'))
dynamodb = boto3.resource('dynamodb')

BUCKET_NAME = os.environ.get('PDF_BUCKET_NAME')
USER_QUOTA_TABLE_NAME = os.environ.get('USER_QUOTA_TABLE_NAME')
NEW_USER_QUOTA = int(os.environ.get('NEW_USER_QUOTA', '10'))

CORS_HEADERS = {
    "Content-Type": "application/json",
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type,X-Amz-Date,Authorization,X-Api-Key,X-Amz-Security-Token",
    "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
}


def get_user_quota(user_id):
    """Get or create user quota record."""
    table = dynamodb.Table(USER_QUOTA_TABLE_NAME)
    
    response = table.get_item(Key={'userId': user_id})
    
    if 'Item' not in response:
        # New user - create quota record with default limit
        now = datetime.now(timezone.utc).isoformat()
        
        item = {
            'userId': user_id,
            'uploadCount': 0,
            'uploadLimit': NEW_USER_QUOTA,
            'periodStart': now,
            'subscriptionTier': 'free',
            'subscriptionExpiry': None,
            'createdAt': now,
            'updatedAt': now,
        }
        table.put_item(Item=item)
        return item
    
    return response['Item']


def increment_upload_count(user_id):
    """Increment the upload count for a user."""
    table = dynamodb.Table(USER_QUOTA_TABLE_NAME)
    now = datetime.now(timezone.utc).isoformat()
    
    table.update_item(
        Key={'userId': user_id},
        UpdateExpression='SET uploadCount = uploadCount + :inc, updatedAt = :now',
        ExpressionAttributeValues={
            ':inc': 1,
            ':now': now,
        }
    )


def check_quota(user_id):
    """Check if user has remaining quota. Returns (allowed, quota_info)."""
    quota = get_user_quota(user_id)
    
    upload_count = int(quota.get('uploadCount', 0))
    upload_limit = int(quota.get('uploadLimit', 10))
    remaining = max(0, upload_limit - upload_count)
    
    quota_info = {
        'uploadCount': upload_count,
        'uploadLimit': upload_limit,
        'remaining': remaining,
        'subscriptionTier': quota.get('subscriptionTier', 'free'),
    }
    
    return remaining > 0, quota_info


def handler(event, context):
    """Generate a presigned URL for uploading a PDF to S3 with quota check."""
    try:
        # Extract user ID from Cognito authorizer claims
        claims = event.get('requestContext', {}).get('authorizer', {}).get('claims', {})
        user_id = claims.get('sub') or claims.get('cognito:username')
        
        if not user_id:
            return {
                "statusCode": 401,
                "headers": CORS_HEADERS,
                "body": json.dumps({"error": "User not authenticated"}),
            }
        
        # Check quota before generating URL
        allowed, quota_info = check_quota(user_id)
        
        if not allowed:
            return {
                "statusCode": 403,
                "headers": CORS_HEADERS,
                "body": json.dumps({
                    "error": "Upload quota exceeded",
                    "quota": quota_info,
                    "message": f"You have used all {quota_info['uploadLimit']} uploads. Please upgrade your subscription for more uploads.",
                }),
            }
        
        body = json.loads(event.get('body', '{}'))
        filename = body.get('filename', 'document.pdf')
        content_type = body.get('contentType', 'application/pdf')
        
        # Generate unique key for the file
        file_id = str(uuid.uuid4())
        key = f"uploads/{user_id}/{file_id}/{filename}"
        
        # Generate presigned URL for PUT operation
        presigned_url = s3_client.generate_presigned_url(
            'put_object',
            Params={
                'Bucket': BUCKET_NAME,
                'Key': key,
                'ContentType': content_type,
            },
            ExpiresIn=300  # 5 minutes
        )
        
        # Increment upload count after successful URL generation
        increment_upload_count(user_id)
        
        # Update quota info after increment
        quota_info['uploadCount'] += 1
        quota_info['remaining'] -= 1
        
        return {
            "statusCode": 200,
            "headers": CORS_HEADERS,
            "body": json.dumps({
                "uploadUrl": presigned_url,
                "fileId": file_id,
                "key": key,
                "quota": quota_info,
            }),
        }
    except Exception as e:
        return {
            "statusCode": 500,
            "headers": CORS_HEADERS,
            "body": json.dumps({"error": str(e)}),
        }
