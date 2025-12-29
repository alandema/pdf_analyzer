import json
import os
from datetime import timezone

import boto3


s3 = boto3.client('s3')

PROCESSED_BUCKET_NAME = os.environ.get('PROCESSED_BUCKET_NAME', '')
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


def _key_to_date(key: str) -> str:
    # Expected: userId/YYYY/MM/DD/<filename>
    parts = key.split('/')
    if len(parts) >= 4 and len(parts[1]) == 4 and len(parts[2]) == 2 and len(parts[3]) == 2:
        return f"{parts[1]}-{parts[2]}-{parts[3]}"
    return "unknown"


def handler(event, context):
    print(json.dumps(event))

    if not PROCESSED_BUCKET_NAME:
        return _response(500, {"error": "PROCESSED_BUCKET_NAME is not configured"})

    if event.get('httpMethod') == 'OPTIONS':
        return {"statusCode": 200, "headers": CORS_HEADERS, "body": ""}

    user_id = _get_user_id(event)
    if not user_id:
        return _response(401, {"error": "Unauthorized"})

    prefix = f"{user_id}/"
    grouped: dict[str, list[dict]] = {}

    paginator = s3.get_paginator('list_objects_v2')
    for page in paginator.paginate(Bucket=PROCESSED_BUCKET_NAME, Prefix=prefix):
        for obj in page.get('Contents', []) or []:
            key = obj.get('Key')
            if not key or key.endswith('/'):
                continue

            date = _key_to_date(key)
            name = key.split('/')[-1]

            last_modified = obj.get('LastModified')
            last_modified_iso = None
            if last_modified is not None:
                last_modified_iso = last_modified.astimezone(timezone.utc).isoformat().replace('+00:00', 'Z')

            url = s3.generate_presigned_url(
                'get_object',
                Params={
                    'Bucket': PROCESSED_BUCKET_NAME,
                    'Key': key,
                    'ResponseContentDisposition': f'attachment; filename="{name}"',
                },
                ExpiresIn=URL_EXPIRY_SECONDS,
            )

            grouped.setdefault(date, []).append({
                "key": key,
                "name": name,
                "url": url,
                "lastModified": last_modified_iso,
                "size": obj.get('Size'),
            })

    dates = []
    for date in sorted(grouped.keys(), reverse=True):
        files = sorted(grouped[date], key=lambda f: f.get('lastModified') or '', reverse=True)
        dates.append({"date": date, "files": files})

    return _response(200, {"dates": dates})
