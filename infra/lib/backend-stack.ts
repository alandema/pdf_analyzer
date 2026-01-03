import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import { Stack, StackProps, Duration } from 'aws-cdk-lib';
import * as s3 from 'aws-cdk-lib/aws-s3';
import { Construct } from 'constructs';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as path from 'path';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as events from 'aws-cdk-lib/aws-events';
import { createStackParameters, getSsmParameters } from './parameters';

const ssmParams = {
  USER_POOL_ID: 'USER_POOL_ID',
  USER_POOL_CLIENT_ID: 'USER_POOL_CLIENT_ID',
  USER_QUOTA_TABLE_NAME: 'USER_QUOTA_TABLE_NAME',
  RAW_PDF_BUCKET_NAME: 'RAW_PDF_BUCKET_NAME',
  PROCESSED_PDF_BUCKET_NAME: 'PROCESSED_PDF_BUCKET_NAME',
  PDFS_TABLE_NAME: 'PDFS_TABLE_NAME',
  UPLOAD_EVENT_BUS_NAME: 'UPLOAD_EVENT_BUS_NAME',
  NEW_USER_QUOTA: 'NEW_USER_QUOTA',
  STRIPE_GOLD_PRICE_ID: 'STRIPE_GOLD_PRICE_ID',
  STRIPE_PLATINUM_PRICE_ID: 'STRIPE_PLATINUM_PRICE_ID',
};

export class BackendStack extends Stack {
  constructor(scope: Construct, id: string, stackEnv: string, localEnv: any, props?: StackProps) {
    super(scope, id, props);

    const params = getSsmParameters(this, stackEnv, ssmParams);
 

    const pdfBucket = s3.Bucket.fromBucketName(this, 'ImportedPdfBucket', params.RAW_PDF_BUCKET_NAME);
    const processedBucket = s3.Bucket.fromBucketName(this, 'ImportedProcessedBucket', params.PROCESSED_PDF_BUCKET_NAME);
    const userQuotaTable = dynamodb.TableV2.fromTableName(this, 'ImportedUserQuotaTable', params.USER_QUOTA_TABLE_NAME);
    const eventBus = events.EventBus.fromEventBusName(this, 'ImportedEventBus', params.UPLOAD_EVENT_BUS_NAME);
    const pdfsTable = dynamodb.TableV2.fromTableName(this, 'ImportedPdfsTable', params.PDFS_TABLE_NAME);

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
        RAW_PDF_BUCKET_NAME: params.RAW_PDF_BUCKET_NAME,
        USER_QUOTA_TABLE_NAME: params.USER_QUOTA_TABLE_NAME,
        NEW_USER_QUOTA: params.NEW_USER_QUOTA,
        UPLOAD_EVENT_BUS_NAME: params.UPLOAD_EVENT_BUS_NAME,
        PDFS_TABLE_NAME: params.PDFS_TABLE_NAME,
      },
    });

    // Lambda function for listing processed PDFs
    const getUserPdfsFunction = new lambda.Function(this, 'GetProcessedPdfsFunction', {
      functionName: `pdf-analyzer-get-processed-pdfs-${stackEnv}`,
      runtime: lambda.Runtime.PYTHON_3_13,
      handler: 'get_user_pdfs.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../src/backend')),
      timeout: Duration.seconds(30),
      layers: [backendLayer],
      memorySize: 256,
      environment: {
        ENVIRONMENT: stackEnv,
        PROCESSED_PDF_BUCKET_NAME: params.PROCESSED_PDF_BUCKET_NAME,
        URL_EXPIRY_SECONDS: '900',
        PDFS_TABLE_NAME: params.PDFS_TABLE_NAME,
      },
    });

    // Permissions
    pdfBucket.grantPut(uploadFunction);
    userQuotaTable.grantReadWriteData(uploadFunction);
    eventBus.grantPutEventsTo(uploadFunction);
    pdfsTable.grantReadWriteData(uploadFunction);
    pdfsTable.grantReadData(getUserPdfsFunction);
    processedBucket.grantRead(getUserPdfsFunction);

    // === STRIPE INTEGRATION ===
    
    // Lambda for creating Stripe Checkout Sessions (protected)
    const stripeCheckoutFunction = new lambda.Function(this, 'StripeCheckoutFunction', {
      functionName: `pdf-analyzer-stripe-checkout-${stackEnv}`,
      runtime: lambda.Runtime.PYTHON_3_13,
      handler: 'stripe_handler.create_checkout_handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../src/backend')),
      timeout: Duration.seconds(30),
      layers: [backendLayer],
      memorySize: 256,
      environment: {
        STRIPE_GOLD_PRICE_ID: params.STRIPE_GOLD_PRICE_ID,
        STRIPE_PLATINUM_PRICE_ID: params.STRIPE_PLATINUM_PRICE_ID,
        USER_QUOTA_TABLE_NAME: params.USER_QUOTA_TABLE_NAME,
      },
    });

    // Lambda for getting Stripe Plans (public or protected? - let's make it public so users can see plans before login, or protected? The page checks for login, so protected is fine, but public is better for marketing pages. The user is logged in on the subscribe page though. Let's make it public for flexibility, but the current page requires login. I'll make it public.)
    const getPlansFunction = new lambda.Function(this, 'GetPlansFunction', {
      functionName: `pdf-analyzer-get-plans-${stackEnv}`,
      runtime: lambda.Runtime.PYTHON_3_13,
      handler: 'stripe_handler.get_plans_handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../src/backend')),
      timeout: Duration.seconds(30),
      layers: [backendLayer],
      memorySize: 256,
      environment: {
        // No specific env vars needed besides Stripe key which is in .env (loaded by dotenv in handler)
        // But wait, .env is not automatically in lambda environment unless I put it there or use dotenv.
        // The handler uses dotenv to load from .env file bundled with code.
      },
    });

    // Lambda for Stripe Webhooks (public - Stripe calls this)
    const stripeWebhookFunction = new lambda.Function(this, 'StripeWebhookFunction', {
      functionName: `pdf-analyzer-stripe-webhook-${stackEnv}`,
      runtime: lambda.Runtime.PYTHON_3_13,
      handler: 'stripe_handler.webhook_handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../src/backend')),
      timeout: Duration.seconds(30),
      layers: [backendLayer],
      memorySize: 256,
      environment: {
        STRIPE_GOLD_PRICE_ID: params.STRIPE_GOLD_PRICE_ID,
        STRIPE_PLATINUM_PRICE_ID: params.STRIPE_PLATINUM_PRICE_ID,
        USER_QUOTA_TABLE_NAME: params.USER_QUOTA_TABLE_NAME,
      },
    });

    // Grant DynamoDB access to Stripe functions
    userQuotaTable.grantReadWriteData(stripeCheckoutFunction);
    userQuotaTable.grantReadWriteData(stripeWebhookFunction);


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
        cognito.UserPool.fromUserPoolId(this, 'ImportedUserPool', params.USER_POOL_ID),
      ],
      identitySource: 'method.request.header.Authorization',
    });

    // Upload endpoint (protected with Cognito) - generates presigned URL
    const uploadResource = api.root.addResource('upload');
    uploadResource.addMethod('POST', new apigateway.LambdaIntegration(uploadFunction), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Processed PDFs endpoint (protected with Cognito) - returns list + presigned download links
    const processedResource = api.root.addResource('processed');
    processedResource.addMethod('GET', new apigateway.LambdaIntegration(getUserPdfsFunction), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // === STRIPE ENDPOINTS ===
    
    // Create checkout session (protected - user must be logged in)
    const stripeResource = api.root.addResource('stripe');
    const checkoutResource = stripeResource.addResource('checkout');
    checkoutResource.addMethod('POST', new apigateway.LambdaIntegration(stripeCheckoutFunction), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Get plans (public - anyone can see pricing)
    const plansResource = stripeResource.addResource('plans');
    plansResource.addMethod('GET', new apigateway.LambdaIntegration(getPlansFunction));

    // Webhook endpoint (public - Stripe calls this directly)
    const webhookResource = stripeResource.addResource('webhook');
    webhookResource.addMethod('POST', new apigateway.LambdaIntegration(stripeWebhookFunction));

    createStackParameters(this, stackEnv, {
      API_URL: api.url
    });
  }
}
