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
from helpers.dynamo_helpers import get_dynamo_item, update_dynamo_item
from helpers.model_helpers import get_model_from_config
from helpers.prompt_helpers import get_prompt_from_config
from xhtml2pdf import pisa
import io
load_dotenv('.env')

s3 = boto3.client('s3')

RAW_PDF_BUCKET_NAME = os.environ['RAW_PDF_BUCKET_NAME']
PROCESSED_PDF_BUCKET_NAME = os.environ['PROCESSED_PDF_BUCKET_NAME']
CONFIGS_TABLE_NAME = os.environ['CONFIGS_TABLE_NAME']
PDFS_TABLE_NAME = os.environ['PDFS_TABLE_NAME']


class ResponseModel(BaseModel):
    description: str = Field(description="Description of the PDF")


def handler(event, context):
    print(json.dumps(event))
    detail = event.get('detail', {})
    key = detail['key']
    user_id = detail['userId']
    file_id = detail['fileId']
    filename = detail['filename']

    try:
        update_dynamo_item(PDFS_TABLE_NAME, {'user_id': user_id, 'pdf_id': file_id}, "SET #s = :s", {
            ':s': 'processing started',
            '#s': 'status'
        })

        pdf_bytes = s3.get_object(Bucket=RAW_PDF_BUCKET_NAME, Key=key)['Body'].read()

        processing_config = get_dynamo_item(
            CONFIGS_TABLE_NAME,
            {'id': 'default_pdf_processing_config'}
        )

        if processing_config is None:
            raise ValueError("Missing 'default_pdf_processing_config' in configs table. Please insert configuration before processing.")

        today = datetime.now(timezone.utc).date()

        llm_model = get_model_from_config(processing_config)
        prompt = get_prompt_from_config(processing_config.get('prompt_config', {}), pdf_bytes, file_id)

        model_with_structured_output = llm_model.with_structured_output(ResponseModel)
        chain = prompt | model_with_structured_output

        response = chain.invoke({'today': str(today)})


        # Read template
        template_path = os.path.join(os.path.dirname(__file__), 'models', 'processed.html')
        with open(template_path, 'r', encoding='utf-8') as f:
            template = f.read()

        # Fill template
        filled = template
        filled = filled.replace('{{ description }}', response.description)


        # Convert HTML to PDF
        pdf_out = io.BytesIO()
        pisa.CreatePDF(io.StringIO(filled), dest=pdf_out, encoding='utf-8')
        pdf_data = pdf_out.getvalue()

        # Save
        base_filename = filename[:-4] if filename.lower().endswith('.pdf') else filename
        now = datetime.now(timezone.utc)
        processed_key = f"{user_id}/{now.year}/{now.month:02d}/{now.day:02d}/{base_filename}_processed.pdf"

        s3.put_object(Bucket=PROCESSED_PDF_BUCKET_NAME, Key=processed_key, Body=pdf_data, ContentType='application/pdf')

        update_dynamo_item(PDFS_TABLE_NAME, {'user_id': user_id, 'pdf_id': file_id}, "SET #s = :s, processed_s3_uri = :uri, processed_at = :pa", {
            ':s': 'processing completed',
            ':uri': f's3://{PROCESSED_PDF_BUCKET_NAME}/{processed_key}',
            ':pa': datetime.now(timezone.utc).isoformat(),
            '#s': 'status'
        })

        return {'statusCode': 200, 'processedKey': processed_key}

    except Exception as e:
        print(f"Error processing PDF: {e}")
        update_dynamo_item(PDFS_TABLE_NAME, {'user_id': user_id, 'pdf_id': file_id}, "SET #s = :s, error_message = :err", {
            ':s': 'processing failed',
            ':err': str(e),
            '#s': 'status'
        })
        raise  # Re-raise to trigger DLQ

if __name__ == "__main__":
    with open('src/data/tests/events/test.json') as f:
        sample_event = json.load(f)
    print(handler(sample_event, None))