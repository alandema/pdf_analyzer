#!/bin/bash
# Deploy all stacks by default, or a single stack if provided.
#
# Examples:
#   ./cdk_deploy.sh                          # deploys all stacks
#   ./cdk_deploy.sh Pdf-Analyzer-core-development

STACK_NAME="$1"

if [ -z "$STACK_NAME" ]; then
	# Deploy in dependency order because Fn.importValue-based imports require exports to exist.
	cdk deploy "Pdf-Analyzer-core-development" --context environment=development --context stackName=Pdf-Analyzer
	cdk deploy "Pdf-Analyzer-data-development" --context environment=development --context stackName=Pdf-Analyzer
	cdk deploy "Pdf-Analyzer-app-development" --context environment=development --context stackName=Pdf-Analyzer
else
	cdk deploy "$STACK_NAME" --context environment=development --context stackName=Pdf-Analyzer
fi