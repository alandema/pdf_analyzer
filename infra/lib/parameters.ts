
import * as ssm from 'aws-cdk-lib/aws-ssm';
import * as cdk from 'aws-cdk-lib';
import { Construct } from 'constructs';
import * as cr from 'aws-cdk-lib/custom-resources';

// Dummy value used when SSM parameter doesn't exist yet (passes AWS resource name validation)
const DUMMY_VALUE = 'pending-value-placeholder';

/**
 * Get SSM parameters using valueFromLookup (resolved at synth time).
 * Returns a dummy value if the parameter doesn't exist yet.
 * 
 * After deploying the producing stack, run `cdk context --clear` to pick up real values.
 */
export function getSsmParameters(scope: Construct, stackEnv: string, params: { [key: string]: string }): { [key: string]: string } {
    const result: { [key: string]: string } = {};
    
    Object.entries(params).forEach(([key, paramName]) => {
        const fullParamName = `/${stackEnv}/${paramName}`;
        const value = ssm.StringParameter.valueFromLookup(scope, fullParamName, DUMMY_VALUE);
        
        if (value === DUMMY_VALUE) {
            console.warn(`⚠️  Parameter ${fullParamName} not found. Using placeholder.`);
        }
        
        result[key] = value;
    });
    
    return result;
}

/**
 * Alias for getSsmParameters - use for cross-stack parameter references.
 */
export const getStackParameters = getSsmParameters;

/**
 * Create SSM parameters using Custom Resource (allows updates without blocking).
 */
export function createStackParameters(scope: Construct, stackEnv: string, params: { [key: string]: string }): void {
    Object.entries(params).forEach(([key, value]) => {
        const paramName = `/${stackEnv}/${key}`;
        
        new cr.AwsCustomResource(scope, `SsmParam-${key}`, {
            onCreate: {
                service: 'SSM',
                action: 'putParameter',
                parameters: { Name: paramName, Value: value, Type: 'String', Overwrite: true },
                physicalResourceId: cr.PhysicalResourceId.of(paramName),
            },
            onUpdate: {
                service: 'SSM',
                action: 'putParameter',
                parameters: { Name: paramName, Value: value, Type: 'String', Overwrite: true },
                physicalResourceId: cr.PhysicalResourceId.of(paramName),
            },
            onDelete: {
                service: 'SSM',
                action: 'deleteParameter',
                parameters: { Name: paramName },
                // Ignore errors if parameter doesn't exist or was already deleted
                ignoreErrorCodesMatching: 'ParameterNotFound',
            },
            // Use broader policy to ensure delete permissions survive stack updates
            policy: cr.AwsCustomResourcePolicy.fromStatements([
                new cdk.aws_iam.PolicyStatement({
                    actions: ['ssm:PutParameter', 'ssm:DeleteParameter'],
                    resources: [`arn:aws:ssm:${cdk.Stack.of(scope).region}:${cdk.Stack.of(scope).account}:parameter/${stackEnv}/*`],
                }),
            ]),
        });
    });
}