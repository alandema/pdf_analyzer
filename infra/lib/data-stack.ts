import { Stack, StackProps, RemovalPolicy, Duration } from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as iam from 'aws-cdk-lib/aws-iam';
import * as sqs from 'aws-cdk-lib/aws-sqs';
import * as events from 'aws-cdk-lib/aws-events';
import * as targets from 'aws-cdk-lib/aws-events-targets';
import * as path from 'path';
import { Construct } from 'constructs';
import { createStackParameters, getSsmParameters } from './parameters';

const ssmParams = {
};

export class DataStack extends Stack {
  constructor(scope: Construct, id: string, stackEnv: string, localEnv: any, props?: StackProps) {
    super(scope, id, props);

    const params = getSsmParameters(this, stackEnv, ssmParams);

    // S3 Bucket for PDF storage with lifecycle rules
    const pdfBucket = new s3.Bucket(this, 'PdfBucket', {
      bucketName: `pdf-analyzer-uploads-${stackEnv}-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: stackEnv === 'production' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      autoDeleteObjects: stackEnv !== 'production',
      versioned: false,
      lifecycleRules: [
        {
          id: 'TransitionToIA',
          transitions: [
            {
              storageClass: s3.StorageClass.INFREQUENT_ACCESS,
              transitionAfter: Duration.days(30),
            },
          ],
        },
        {
          id: 'ExpireOldFiles',
          expiration: Duration.days(365),
        },
      ],
    });

    // DynamoDB table for metadata with TTL
    const pdfsTable = new dynamodb.TableV2(this, 'PDFsTable', {
      tableName: `pdf-analyzer-pdfs-${stackEnv}`,
      partitionKey: { name: 'user_id', type: dynamodb.AttributeType.STRING },
      sortKey: { name: 'pdf_id', type: dynamodb.AttributeType.STRING },
      billing: dynamodb.Billing.onDemand(),
      removalPolicy: stackEnv === 'production' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      timeToLiveAttribute: 'ttl',
    });

    const configsTable = new dynamodb.TableV2(this, 'ConfigsTable', {
      tableName: `pdf-analyzer-configs-${stackEnv}`,
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billing: dynamodb.Billing.onDemand(),
      removalPolicy: stackEnv === 'production' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });

    // Processed PDF bucket
    const processedBucket = new s3.Bucket(this, 'ProcessedPdfBucket', {
      bucketName: `pdf-analyzer-processed-${stackEnv}-${this.account}`,
      blockPublicAccess: s3.BlockPublicAccess.BLOCK_ALL,
      removalPolicy: stackEnv === 'production' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      autoDeleteObjects: stackEnv !== 'production',
    });

    // EventBridge bus and DLQ
    const uploadEventBus = new events.EventBus(this, 'PdfEventBus', {
      eventBusName: `pdf-analyzer-upload-bus-${stackEnv}`,
    });

    const dlq = new sqs.Queue(this, 'PdfEventDlq', {
      queueName: `pdf-analyzer-dlq-${stackEnv}`,
    });

    // Lambda Layer with dependencies (numpy, python-dotenv) bundled via Docker
    const dataLayer = new lambda.LayerVersion(this, 'DataProcessorLayer', {
      layerVersionName: `pdf-analyzer-data-layer-${stackEnv}`,
      code: lambda.Code.fromAsset(path.join(__dirname, '../../src/data'), {
        bundling: {
          image: lambda.Runtime.PYTHON_3_13.bundlingImage,
          command: [
            'bash', '-c',
            'pip install -r requirements.txt -t /asset-output/python && cp -au . /asset-output/python',
          ],
        },
      }),
      compatibleRuntimes: [lambda.Runtime.PYTHON_3_13],
      description: 'Layer with numpy and python-dotenv for data processing',
    });

    // Data processor Lambda function
    const dataProcessorFunction = new lambda.Function(this, 'DataProcessorFunction', {
      functionName: `pdf-analyzer-data-processor-${stackEnv}`,
      runtime: lambda.Runtime.PYTHON_3_13,
      handler: 'processor.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../src/data'), {
        exclude: ['requirements.txt'],
      }),
      layers: [dataLayer],
      timeout: Duration.seconds(60),
      memorySize: 512,
      environment: {
        ENVIRONMENT: stackEnv,
        RAW_PDF_BUCKET_NAME: pdfBucket.bucketName,
        PROCESSED_PDF_BUCKET_NAME: processedBucket.bucketName,
        PDFS_TABLE_NAME: pdfsTable.tableName,
        CONFIGS_TABLE_NAME: configsTable.tableName,
      },
    });

    // Grant Lambda permissions
    pdfBucket.grantRead(dataProcessorFunction);
    processedBucket.grantWrite(dataProcessorFunction);
    pdfsTable.grantReadWriteData(dataProcessorFunction);
    configsTable.grantReadData(dataProcessorFunction);

    // Allow invoking Bedrock models from this Lambda
    dataProcessorFunction.addToRolePolicy(new iam.PolicyStatement({
      actions: ['bedrock:InvokeModel','bedrock:InvokeModelWithResponseStream','bedrock:Converse','bedrock:ConverseStream'],
      resources: [`arn:aws:bedrock:${this.region}:${this.account}:inference-profile/*`,
        `arn:aws:bedrock:${this.region}:${this.account}:foundation-model/*`,
        `arn:aws:bedrock:*::inference-profile/*`,
        `arn:aws:bedrock:*::foundation-model/*`
      ],
    }));

    // EventBridge rule to trigger processor
    new events.Rule(this, 'PdfUploadedRule', {
      eventBus: uploadEventBus,
      eventPattern: { source: ['pdf-analyzer'], detailType: ['PDF_UPLOADED'] },
      targets: [new targets.LambdaFunction(dataProcessorFunction, { deadLetterQueue: dlq })],
    });

    createStackParameters(this, stackEnv, {
      RAW_PDF_BUCKET_NAME: pdfBucket.bucketName,
      PROCESSED_PDF_BUCKET_NAME: processedBucket.bucketName,
      PDFS_TABLE_NAME: pdfsTable.tableName,
      UPLOAD_EVENT_BUS_NAME: uploadEventBus.eventBusName,
    });
  }
}
