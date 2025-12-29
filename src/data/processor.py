"""Process PDF from EventBridge event and save to processed bucket."""
import os
import boto3
from datetime import datetime, timezone
import json
from langchain_aws import ChatBedrock
from botocore.config import Config
from dotenv import load_dotenv
from pydantic import BaseModel, Field
from langchain_core.prompts import PromptTemplate
from helpers.dynamo_helpers import get_dynamo_item
from helpers.model_helpers import get_model_from_config
from helpers.prompt_helpers import get_prompt_from_config
load_dotenv('.env')

s3 = boto3.client('s3')

PDF_BUCKET = os.environ['PDF_BUCKET_NAME']
PROCESSED_BUCKET = os.environ['PROCESSED_BUCKET_NAME']
PROCESSING_CONFIG_TABLE_NAME = os.environ['PROCESSING_CONFIG_TABLE_NAME']


class ResponseModel(BaseModel):
    description: str = Field(description="Description of the processing result")


def handler(event, context):
    print(json.dumps(event))
    detail = event.get('detail', {})
    key = detail['key']
    user_id = detail['userId']
    file_id = detail['fileId']
    filename = detail['filename']

    pdf_bytes= s3.get_object(Bucket=PDF_BUCKET, Key=key)['Body'].read()

    processing_config = get_dynamo_item(
        PROCESSING_CONFIG_TABLE_NAME,
        {'id': 'default_config'}
    )

    today = datetime.now(timezone.utc).date()

    llm_model = get_model_from_config(processing_config)
    prompt = get_prompt_from_config(processing_config.get('prompt_config', {}),pdf_bytes,file_id)

    model_with_structured_output = llm_model.with_structured_output(ResponseModel)
    chain = prompt | model_with_structured_output

    response = chain.invoke({'today': str(today)})

    if response.description:
        print("Processing description:", response.description)

    response = s3.get_object(Bucket=PDF_BUCKET, Key=key)
    pdf_data = response['Body'].read()

    # Build processed key using the validated filename from upload
    # Remove .pdf extension and add _processed.pdf
    base_filename = filename[:-4] if filename.lower().endswith('.pdf') else filename
    now = datetime.now(timezone.utc)
    processed_key = f"{user_id}/{now.year}/{now.month:02d}/{now.day:02d}/{base_filename}_processed.pdf"

    # Save to processed bucket
    s3.put_object(Bucket=PROCESSED_BUCKET, Key=processed_key, Body=pdf_data, ContentType='application/pdf')

    return {'statusCode': 200, 'processedKey': processed_key}

if __name__ == "__main__":
    with open('src/data/tests/events/test.json') as f:
        sample_event = json.load(f)
    print(handler(sample_event, None))