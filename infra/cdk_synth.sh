#!/bin/bash
# Synthesize all stacks by default, or a single stack if provided.
#
# Examples:
#   ./cdk_synth.sh                          # synth all stacks
#   ./cdk_synth.sh Pdf-Analyzer-core-development

STACK_NAME="$1"

if [ -z "$STACK_NAME" ]; then
	cdk synth --context environment=development --context stackName=Pdf-Analyzer
else
	cdk synth "$STACK_NAME" --context environment=development --context stackName=Pdf-Analyzer
fi