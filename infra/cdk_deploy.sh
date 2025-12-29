#!/bin/bash
# Deploy all stacks by default, or a single stack if provided.
#
# Examples:
#   ./cdk_deploy.sh                          # deploys all stacks
#   ./cdk_deploy.sh Pdf-Analyzer-core-development

STACK_NAME="$1"

if [ -z "$STACK_NAME" ]; then
	# Deploy all stacks in dependency order as defined in infra.ts
	cdk deploy --all --context environment=development --context stackName=Pdf-Analyzer
else
	cdk deploy "$STACK_NAME" --context environment=development --context stackName=Pdf-Analyzer
fi