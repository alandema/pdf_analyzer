#!/bin/bash
# Deploy all stacks by default, or a single stack if provided.
#
# Examples:
#   ./cdk_deploy.sh                          # deploys all stacks
#   ./cdk_deploy.sh Pdf-Analyzer-core-development

STACK_NAME="$1"

if [ -z "$STACK_NAME" ]; then
	# IMPORTANT:
	# This repo uses SSM lookups via `ssm.StringParameter.valueFromLookup`, which resolve at synth time
	# and cache results in cdk.context.json. That means consumers must be synthesized only AFTER the
	# producing stacks have deployed their SSM parameters.
	#
	# So we deploy in phases and clear context between phases.
	ENVIRONMENT="development"
	STACK_BASE="Pdf-Analyzer"

	set -e

	cdk context --clear
	cdk deploy "${STACK_BASE}-core-${ENVIRONMENT}" --context environment=${ENVIRONMENT} --context stackName=${STACK_BASE}

	cdk context --clear
	cdk deploy "${STACK_BASE}-data-${ENVIRONMENT}" --context environment=${ENVIRONMENT} --context stackName=${STACK_BASE}

	cdk context --clear
	cdk deploy "${STACK_BASE}-backend-${ENVIRONMENT}" --context environment=${ENVIRONMENT} --context stackName=${STACK_BASE}

	cdk context --clear
	cdk deploy "${STACK_BASE}-frontend-${ENVIRONMENT}" --context environment=${ENVIRONMENT} --context stackName=${STACK_BASE}
else
	cdk context --clear && cdk deploy "$STACK_NAME" --context environment=development --context stackName=Pdf-Analyzer
fi