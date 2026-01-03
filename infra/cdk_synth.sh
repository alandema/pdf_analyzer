#!/bin/bash
# Synthesize all stacks by default, or a single stack if provided.
#
# Examples:
#   ./cdk_synth.sh                          # synth all stacks
#   ./cdk_synth.sh Pdf-Analyzer-core-development

STACK_NAME="$1"

if [ -z "$STACK_NAME" ]; then
	# When SSM parameters are resolved via synth-time lookups, you may need to synth stacks
	# after their dependencies have deployed. This script keeps the same phased order.
	ENVIRONMENT="development"
	STACK_BASE="Pdf-Analyzer"

	set -e

	cdk context --clear
	cdk synth "${STACK_BASE}-core-${ENVIRONMENT}" --context environment=${ENVIRONMENT} --context stackName=${STACK_BASE}

	cdk context --clear
	cdk synth "${STACK_BASE}-data-${ENVIRONMENT}" --context environment=${ENVIRONMENT} --context stackName=${STACK_BASE}

	cdk context --clear
	cdk synth "${STACK_BASE}-backend-${ENVIRONMENT}" --context environment=${ENVIRONMENT} --context stackName=${STACK_BASE}

	cdk context --clear
	cdk synth "${STACK_BASE}-frontend-${ENVIRONMENT}" --context environment=${ENVIRONMENT} --context stackName=${STACK_BASE}
else
	cdk context --clear && cdk synth "$STACK_NAME" --context environment=development --context stackName=Pdf-Analyzer
fi