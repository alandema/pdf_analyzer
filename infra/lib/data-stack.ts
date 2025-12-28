import { Stack, StackProps, RemovalPolicy, Duration } from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as path from 'path';
import { Construct } from 'constructs';
import { createStackParameters, getSsmParameters } from './parameters';

const inputSsmParams = {
  NEW_USER_QUOTA: 'NEW_USER_QUOTA',
};

export class DataStack extends Stack {
  public readonly pdfBucket: s3.Bucket;
  public readonly metadataTable: dynamodb.TableV2;
  public readonly userQuotaTable: dynamodb.TableV2;
  public readonly dataProcessorFunction: lambda.Function;
  public readonly newUserQuota: string;

  constructor(scope: Construct, id: string, stackEnv: string, localEnv: any, props?: StackProps) {
    super(scope, id, props);

    // Read SSM parameters
    const ssmParams = getSsmParameters(this, stackEnv, inputSsmParams);
    this.newUserQuota = ssmParams.NEW_USER_QUOTA;



    // S3 Bucket for PDF storage with lifecycle rules
    this.pdfBucket = new s3.Bucket(this, 'PdfBucket', {
      bucketName: `pdf-analyzer-uploads-${stackEnv}-${this.account}`,
      encryption: s3.BucketEncryption.S3_MANAGED,
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
    this.metadataTable = new dynamodb.TableV2(this, 'MetadataTable', {
      tableName: `pdf-analyzer-metadata-${stackEnv}`,
      partitionKey: { name: 'id', type: dynamodb.AttributeType.STRING },
      billing: dynamodb.Billing.onDemand(),
      removalPolicy: stackEnv === 'production' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
      timeToLiveAttribute: 'ttl',
    });

    // DynamoDB table for user quota tracking
    this.userQuotaTable = new dynamodb.TableV2(this, 'UserQuotaTable', {
      tableName: `pdf-analyzer-user-quota-${stackEnv}`,
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      billing: dynamodb.Billing.onDemand(),
      removalPolicy: stackEnv === 'production' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
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
    this.dataProcessorFunction = new lambda.Function(this, 'DataProcessorFunction', {
      functionName: `pdf-analyzer-data-processor-${stackEnv}`,
      runtime: lambda.Runtime.PYTHON_3_13,
      handler: 'main.lambda_handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../src/data'), {
        exclude: ['requirements.txt'],
      }),
      layers: [dataLayer],
      timeout: Duration.seconds(60),
      memorySize: 512,
      environment: {
        ENVIRONMENT: stackEnv,
        PDF_BUCKET_NAME: this.pdfBucket.bucketName,
        METADATA_TABLE_NAME: this.metadataTable.tableName,
      },
    });

    // Grant Lambda permissions
    this.pdfBucket.grantReadWrite(this.dataProcessorFunction);
    this.metadataTable.grantReadWriteData(this.dataProcessorFunction);

    // Export values for other stacks
    createStackParameters(this, stackEnv, {
      PDF_BUCKET_NAME: this.pdfBucket.bucketName,
      PDF_BUCKET_ARN: this.pdfBucket.bucketArn,
      METADATA_TABLE_NAME: this.metadataTable.tableName,
      METADATA_TABLE_ARN: this.metadataTable.tableArn,
      USER_QUOTA_TABLE_NAME: this.userQuotaTable.tableName,
      USER_QUOTA_TABLE_ARN: this.userQuotaTable.tableArn,
      NEW_USER_QUOTA: this.newUserQuota,
      DATA_PROCESSOR_FUNCTION_ARN: this.dataProcessorFunction.functionArn,
    });
  }
}
