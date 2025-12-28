import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { CoreStack } from '../lib/core-stack';
import { DataStack } from '../lib/data-stack';
import { AppStack } from '../lib/app-stack';

const app = new cdk.App();
const stackEnv = app.node.tryGetContext('environment');
const stackName = app.node.tryGetContext('stackName');

if (!stackEnv || typeof stackEnv !== 'string') {
  throw new Error('Missing required CDK context: environment (e.g. --context environment=development)');
}
if (!stackName || typeof stackName !== 'string') {
  throw new Error('Missing required CDK context: stackName (e.g. --context stackName=Pdf-Analyzer)');
}

const localEnv = app.node.tryGetContext(stackEnv);

const baseProps: cdk.StackProps = {
  env: {
    account: process.env.CDK_DEFAULT_ACCOUNT,
    region: process.env.CDK_DEFAULT_REGION,
  },
};

// Stack deployment order:
// 1. CoreStack - Frontend infrastructure (CloudFront + S3 website)
// 2. DataStack - Data infrastructure (S3 PDFs + DynamoDB)
// 3. AppStack - Backend infrastructure (API Gateway + Lambda + Cognito)

const coreStack = new CoreStack(app, `${stackName}-core-${stackEnv}`, stackEnv, localEnv, baseProps);

const dataStack = new DataStack(app, `${stackName}-data-${stackEnv}`, stackEnv, localEnv, baseProps);

const appStack = new AppStack(app, `${stackName}-app-${stackEnv}`, stackEnv, localEnv, {
  ...baseProps,
  pdfBucket: dataStack.pdfBucket,
  metadataTable: dataStack.metadataTable,
  userQuotaTable: dataStack.userQuotaTable,
  newUserQuota: dataStack.newUserQuota,
});

// Dependencies
appStack.node.addDependency(dataStack);
appStack.node.addDependency(coreStack);