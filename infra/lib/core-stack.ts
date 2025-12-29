import { Stack, StackProps, Duration, RemovalPolicy } from 'aws-cdk-lib';
import * as cognito from 'aws-cdk-lib/aws-cognito';
import * as dynamodb from 'aws-cdk-lib/aws-dynamodb';
import { Construct } from 'constructs';
import { createStackParameters, getSsmParameters} from './parameters';

const inputSsmParams = {
  NEW_USER_QUOTA: 'NEW_USER_QUOTA'
};


export class CoreStack extends Stack {
  constructor(scope: Construct, id: string, stackEnv: string, localEnv: any, props: StackProps) {
    super(scope, id, props);

    const ssmParams = getSsmParameters(this, stackEnv, inputSsmParams);

    // Cognito User Pool for authentication
    const userPool = new cognito.UserPool(this, 'UserPool', {
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

    const userPoolClient = userPool.addClient('WebClient', {
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

    // DynamoDB table for user quota tracking
    const userQuotaTable = new dynamodb.TableV2(this, 'UserQuotaTable', {
      partitionKey: { name: 'userId', type: dynamodb.AttributeType.STRING },
      billing: dynamodb.Billing.onDemand(),
      removalPolicy: stackEnv === 'production' ? RemovalPolicy.RETAIN : RemovalPolicy.DESTROY,
    });

    createStackParameters(this, stackEnv, {
      USER_POOL_ID: userPool.userPoolId,
      USER_POOL_CLIENT_ID: userPoolClient.userPoolClientId,
      USER_QUOTA_TABLE_NAME: userQuotaTable.tableName,
    });

  }
}
