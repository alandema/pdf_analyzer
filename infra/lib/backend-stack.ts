import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import { Stack, StackProps} from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as cloudfront from 'aws-cdk-lib/aws-cloudfront';
import { Construct } from 'constructs';
import { createStackParameters, getSsmParameters, getStackParameters } from './parameters';
import { Duration} from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as path from 'path';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as events from 'aws-cdk-lib/aws-events';

const inputStackParams = {
  USER_POOL_ID: 'USER_POOL_ID',
  USER_POOL_CLIENT_ID: 'USER_POOL_CLIENT_ID',
  USER_QUOTA_TABLE_NAME: 'USER_QUOTA_TABLE_NAME',
  PDF_BUCKET_NAME: 'PDF_BUCKET_NAME',
  PROCESSED_BUCKET_NAME: 'PROCESSED_BUCKET_NAME',
  METADATA_TABLE_NAME: 'METADATA_TABLE_NAME',
  EVENT_BUS_NAME: 'EVENT_BUS_NAME',
};

const inputSsmParams = {
  NEW_USER_QUOTA: 'NEW_USER_QUOTA',
};

export class BackendStack extends Stack {
  public readonly websiteBucket: s3.Bucket;
  public readonly distribution: cloudfront.Distribution;

  constructor(scope: Construct, id: string, stackEnv: string, localEnv: any, props?: StackProps) {
    super(scope, id, props);

    const stackParams = getStackParameters(this, stackEnv, inputStackParams);
    const ssmParams = getSsmParameters(this, stackEnv, inputSsmParams);

    const pdfBucket = s3.Bucket.fromBucketName(this, 'ImportedPdfBucket', stackParams.PDF_BUCKET_NAME);
    const processedBucket = s3.Bucket.fromBucketName(this, 'ImportedProcessedBucket', stackParams.PROCESSED_BUCKET_NAME);
    const userQuotaTable = dynamodb.TableV2.fromTableName(this, 'ImportedUserQuotaTable', stackParams.USER_QUOTA_TABLE_NAME);
    const eventBus = events.EventBus.fromEventBusName(this, 'ImportedEventBus', stackParams.EVENT_BUS_NAME);

      // Lambda Layer with dependencies (numpy, python-dotenv) bundled via Docker
      const backendLayer = new lambda.LayerVersion(this, 'BackendLayer', {
        layerVersionName: `pdf-analyzer-backend-layer-${stackEnv}`,
        code: lambda.Code.fromAsset(path.join(__dirname, '../../src/backend'), {
          bundling: {
            image: lambda.Runtime.PYTHON_3_13.bundlingImage,
            command: [
              'bash', '-c',
              'pip install -r requirements.txt -t /asset-output/python && cp -au . /asset-output/python',
            ],
          },
        }),
        compatibleRuntimes: [lambda.Runtime.PYTHON_3_13],
        description: 'Layer for backend Lambda functions',
      });


    // Lambda function for Hello World API
    const helloFunction = new lambda.Function(this, 'HelloFunction', {
      functionName: `pdf-analyzer-hello-${stackEnv}`,
      runtime: lambda.Runtime.PYTHON_3_13,
      handler: 'hello.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../src/backend')),
      timeout: Duration.seconds(30),
      layers: [backendLayer],
      memorySize: 256,
      environment: {
        ENVIRONMENT: stackEnv,
        PDF_BUCKET_NAME: stackParams.PDF_BUCKET_NAME,
        METADATA_TABLE_NAME: stackParams.METADATA_TABLE_NAME,
      },
    });

    // Lambda function for PDF upload
    const uploadFunction = new lambda.Function(this, 'UploadFunction', {
      functionName: `pdf-analyzer-upload-${stackEnv}`,
      runtime: lambda.Runtime.PYTHON_3_13,
      handler: 'upload.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../src/backend')),
      timeout: Duration.seconds(30),
      layers: [backendLayer],
      memorySize: 256,
      environment: {
        ENVIRONMENT: stackEnv,
        PDF_BUCKET_NAME: stackParams.PDF_BUCKET_NAME,
        USER_QUOTA_TABLE_NAME: stackParams.USER_QUOTA_TABLE_NAME,
        NEW_USER_QUOTA: ssmParams.NEW_USER_QUOTA,
        EVENT_BUS_NAME: stackParams.EVENT_BUS_NAME,
      },
    });

    // Lambda function for listing processed PDFs
    const getProcessedPdfsFunction = new lambda.Function(this, 'GetProcessedPdfsFunction', {
      functionName: `pdf-analyzer-get-processed-pdfs-${stackEnv}`,
      runtime: lambda.Runtime.PYTHON_3_13,
      handler: 'get_processed_pdfs.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../src/backend')),
      timeout: Duration.seconds(30),
      layers: [backendLayer],
      memorySize: 256,
      environment: {
        ENVIRONMENT: stackEnv,
        PROCESSED_BUCKET_NAME: stackParams.PROCESSED_BUCKET_NAME,
        URL_EXPIRY_SECONDS: '900',
      },
    });

    // Permissions
    pdfBucket.grantPut(uploadFunction);
    userQuotaTable.grantReadWriteData(uploadFunction);
    eventBus.grantPutEventsTo(uploadFunction);

    processedBucket.grantRead(getProcessedPdfsFunction);


    // REST API with CORS
    const api = new apigateway.RestApi(this, 'PdfAnalyzerApi', {
      restApiName: `pdf-analyzer-api-${stackEnv}`,
      description: 'PDF Analyzer API',
      deployOptions: {
        stageName: stackEnv,
      },
      defaultCorsPreflightOptions: {
        allowOrigins: apigateway.Cors.ALL_ORIGINS,
        allowMethods: apigateway.Cors.ALL_METHODS,
        allowHeaders: [
          'Content-Type',
          'X-Amz-Date',
          'Authorization',
          'X-Api-Key',
          'X-Amz-Security-Token',
        ],
        allowCredentials: true,
      },
    });

    // Cognito Authorizer
    const authorizer = new apigateway.CognitoUserPoolsAuthorizer(this, 'ApiAuthorizer', {
      cognitoUserPools: [
        cognito.UserPool.fromUserPoolId(this, 'ImportedUserPool', stackParams.USER_POOL_ID),
      ],
      identitySource: 'method.request.header.Authorization',
    });

    // Hello endpoint (protected with Cognito)
    const helloResource = api.root.addResource('hello');
    helloResource.addMethod('GET', new apigateway.LambdaIntegration(helloFunction), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Upload endpoint (protected with Cognito) - generates presigned URL
    const uploadResource = api.root.addResource('upload');
    uploadResource.addMethod('POST', new apigateway.LambdaIntegration(uploadFunction), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Processed PDFs endpoint (protected with Cognito) - returns list + presigned download links
    const processedResource = api.root.addResource('processed');
    processedResource.addMethod('GET', new apigateway.LambdaIntegration(getProcessedPdfsFunction), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

        // Export values
    createStackParameters(this, stackEnv, {
      API_URL: api.url
    });

  }
}
