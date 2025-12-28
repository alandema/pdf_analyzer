import { Stack, StackProps, Duration, RemovalPolicy } from 'aws-cdk-lib';
import * as lambda from 'aws-cdk-lib/aws-lambda';
import * as apigateway from 'aws-cdk-lib/aws-apigateway';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as s3 from 'aws-cdk-lib/aws-s3';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import * as path from 'path';
import { Construct } from 'constructs';
import { createStackParameters } from './parameters';

interface AppStackProps extends StackProps {
  pdfBucket: s3.IBucket;
  metadataTable: dynamodb.ITableV2;
  userQuotaTable: dynamodb.ITableV2;
  newUserQuota: string;
}

export class AppStack extends Stack {
  public readonly userPool: cognito.UserPool;
  public readonly userPoolClient: cognito.UserPoolClient;
  public readonly api: apigateway.RestApi;

  constructor(scope: Construct, id: string, stackEnv: string, localEnv: any, props: AppStackProps) {
    super(scope, id, props);

    // Cognito User Pool for authentication
    this.userPool = new cognito.UserPool(this, 'UserPool', {
      userPoolName: `pdf-analyzer-users-${stackEnv}`,
      selfSignUpEnabled: true,
      signInAliases: { email: true },
      autoVerify: { email: true },
      passwordPolicy: {
        minLength: 8,
        requireLowercase: true,
        requireUppercase: true,
        requireDigits: true,
        requireSymbols: false,
      },
      accountRecovery: cognito.AccountRecovery.EMAIL_ONLY,
      removalPolicy: stackEnv === 'production' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });

    this.userPoolClient = this.userPool.addClient('WebClient', {
      userPoolClientName: `pdf-analyzer-web-client-${stackEnv}`,
      authFlows: {
        userPassword: true,
        userSrp: true,
      },
      oAuth: {
        flows: { authorizationCodeGrant: true },
        scopes: [cognito.OAuthScope.OPENID, cognito.OAuthScope.EMAIL, cognito.OAuthScope.PROFILE],
      },
    });

    // Lambda function for Hello World API
    const helloFunction = new lambda.Function(this, 'HelloFunction', {
      functionName: `pdf-analyzer-hello-${stackEnv}`,
      runtime: lambda.Runtime.PYTHON_3_13,
      handler: 'hello.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../src/backend')),
      timeout: Duration.seconds(30),
      memorySize: 256,
      environment: {
        ENVIRONMENT: stackEnv,
        PDF_BUCKET_NAME: props.pdfBucket.bucketName,
        METADATA_TABLE_NAME: props.metadataTable.tableName,
      },
    });

    // Grant Lambda permissions to access resources
    props.pdfBucket.grantReadWrite(helloFunction);
    props.metadataTable.grantReadWriteData(helloFunction);

    // Lambda function for presigned URL generation
    const uploadFunction = new lambda.Function(this, 'UploadFunction', {
      functionName: `pdf-analyzer-upload-${stackEnv}`,
      runtime: lambda.Runtime.PYTHON_3_13,
      handler: 'upload.handler',
      code: lambda.Code.fromAsset(path.join(__dirname, '../../src/backend')),
      timeout: Duration.seconds(30),
      memorySize: 256,
      environment: {
        ENVIRONMENT: stackEnv,
        PDF_BUCKET_NAME: props.pdfBucket.bucketName,
        USER_QUOTA_TABLE_NAME: props.userQuotaTable.tableName,
        NEW_USER_QUOTA: props.newUserQuota,
      },
    });

    // Grant upload Lambda permission to write to S3 and access quota table
    props.pdfBucket.grantPut(uploadFunction);
    props.userQuotaTable.grantReadWriteData(uploadFunction);

    // REST API with CORS
    this.api = new apigateway.RestApi(this, 'PdfAnalyzerApi', {
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
      cognitoUserPools: [this.userPool],
      identitySource: 'method.request.header.Authorization',
    });

    // Hello endpoint (protected with Cognito)
    const helloResource = this.api.root.addResource('hello');
    helloResource.addMethod('GET', new apigateway.LambdaIntegration(helloFunction), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Upload endpoint (protected with Cognito) - generates presigned URL
    const uploadResource = this.api.root.addResource('upload');
    uploadResource.addMethod('POST', new apigateway.LambdaIntegration(uploadFunction), {
      authorizer,
      authorizationType: apigateway.AuthorizationType.COGNITO,
    });

    // Export values
    createStackParameters(this, stackEnv, {
      API_URL: this.api.url,
      USER_POOL_ID: this.userPool.userPoolId,
      USER_POOL_CLIENT_ID: this.userPoolClient.userPoolClientId,
    });
  }
}
