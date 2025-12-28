
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';

function stackExportName(stackEnv: string, baseName: string): string {
    // CloudFormation export names only allow alphanumeric, colons, and hyphens
    const safeEnv = stackEnv
        .trim()
        .replace(/[^A-Za-z0-9-]/g, '-')
        .replace(/-+/g, '-')
        .replace(/^-|-$/g, '');
    const safeName = baseName
        .replace(/_/g, '-')
        .replace(/[^A-Za-z0-9-:]/g, '-')
        .replace(/-+/g, '-');
    if (!safeEnv) {
        return safeName;
    }

    const maxLen = 255;
    const separator = '-';
    const availableEnvLen = Math.max(0, maxLen - (separator.length + safeName.length));
    const truncatedEnv = safeEnv.length > availableEnvLen ? safeEnv.slice(0, availableEnvLen) : safeEnv;
    return `${truncatedEnv}${separator}${safeName}`;
}

// get values fromLookup SSM parameters
export function getSsmParameters(scope: Construct, stackEnv: string, inputSsm: { [key: string]: string }): { [key: string]: string } {
    const params: { [key: string]: string } = {};
    Object.entries(inputSsm).forEach(([key, paramName]) => {
        console.log(`Retrieving SSM parameter: /${stackEnv}/${paramName}`);
        const ssmParam = ssm.StringParameter.valueFromLookup(scope, `/${stackEnv}/${paramName}`);
        console.log(`Retrieved value for /${stackEnv}/${paramName}: ${ssmParam}`);
        params[key] = ssmParam;
    });
    return params;
}

export function getStackParameters(scope: Construct, stackEnv: string, importStackParam: { [key: string]: string }): { [key: string]: string } {
    const params: { [key: string]: string } = {}; //cdk.Fn.importValue

    Object.entries(importStackParam).forEach(([key, paramName]) => {
        const exportName = stackExportName(stackEnv, paramName);
        console.log(`Importing stack parameter: ${exportName}`);
        const importedValue = cdk.Fn.importValue(exportName);
        params[key] = importedValue;
    });

    return params;
}

export function createParameter(scope: Construct, paramName: string, paramValue: string): ssm.StringParameter {
    return new ssm.StringParameter(scope, `CreateParam-${paramName}`, {
        parameterName: paramName,
        stringValue: paramValue,
        tier: ssm.ParameterTier.STANDARD,
    });
}

export function createStackParameters(scope: Construct, stackEnv: string, stackParams: { [key: string]: string }): void {
    Object.entries(stackParams).forEach(([key, value]) => {
        new cdk.CfnOutput(scope, `Output-${key}-Env`, {
            exportName: stackExportName(stackEnv, key),
            value: value,
        });
    });
}