import 'source-map-support/register';
import * as cdk from 'aws-cdk-lib';
import { FrontendStack } from '../lib/frontend-stack';
import { DataStack } from '../lib/data-stack';
import { CoreStack } from '../lib/core-stack';
import {BackendStack} from "../lib/backend-stack";

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


const frontendStack = new FrontendStack(app, `${stackName}-frontend-${stackEnv}`, stackEnv, localEnv, baseProps);
const backendStack = new BackendStack(app, `${stackName}-backend-${stackEnv}`, stackEnv, localEnv, baseProps);
const dataStack = new DataStack(app, `${stackName}-data-${stackEnv}`, stackEnv, localEnv, baseProps);
const coreStack = new CoreStack(app, `${stackName}-core-${stackEnv}`, stackEnv, localEnv, baseProps);

// Dependencies
dataStack.node.addDependency(coreStack);
frontendStack.node.addDependency(coreStack);
backendStack.node.addDependency(dataStack);
frontendStack.node.addDependency(backendStack);