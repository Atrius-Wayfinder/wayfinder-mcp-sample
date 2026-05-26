#!/bin/bash
set -e

cd "$(dirname "$0")"

# Load AWS credentials
source "../../.env.local"

FUNCTION_NAME="wayfinder-mcp-chat"
REGION="us-east-1"
ROLE_NAME="wayfinder-mcp-chat-role"

echo "=== Building Lambda ==="
npm run build

echo "=== Creating deployment package ==="
node zip.mjs

ACCOUNT_ID=$(aws sts get-caller-identity --query Account --output text --region $REGION)
echo "AWS Account: $ACCOUNT_ID"

# Create or get IAM role
echo "=== Setting up IAM role ==="
ROLE_ARN=$(aws iam get-role --role-name $ROLE_NAME --query 'Role.Arn' --output text 2>/dev/null) || {
  echo "Creating IAM role..."
  ROLE_ARN=$(aws iam create-role \
    --role-name $ROLE_NAME \
    --assume-role-policy-document '{
      "Version": "2012-10-17",
      "Statement": [{
        "Effect": "Allow",
        "Principal": {"Service": "lambda.amazonaws.com"},
        "Action": "sts:AssumeRole"
      }]
    }' \
    --query 'Role.Arn' --output text)

  aws iam attach-role-policy \
    --role-name $ROLE_NAME \
    --policy-arn arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole

  echo "Waiting for role propagation..."
  sleep 10
}
echo "Role ARN: $ROLE_ARN"

# Create or update Lambda function
echo "=== Deploying Lambda function ==="
if aws lambda get-function --function-name $FUNCTION_NAME --region $REGION >/dev/null 2>&1; then
  echo "Updating existing function..."
  aws lambda update-function-code \
    --function-name $FUNCTION_NAME \
    --zip-file fileb://function.zip \
    --region $REGION >/dev/null
  # Wait for update to complete
  echo "Waiting for update..."
  sleep 5
  aws lambda update-function-configuration \
    --function-name $FUNCTION_NAME \
    --timeout 60 \
    --memory-size 256 \
    --region $REGION >/dev/null 2>&1 || true
else
  echo "Creating new function..."
  aws lambda create-function \
    --function-name $FUNCTION_NAME \
    --runtime nodejs20.x \
    --handler index.handler \
    --role "$ROLE_ARN" \
    --zip-file fileb://function.zip \
    --timeout 60 \
    --memory-size 256 \
    --region $REGION >/dev/null
  echo "Waiting for function to be active..."
  sleep 5
fi

# Create Function URL if not exists
echo "=== Setting up Function URL ==="
FUNCTION_URL=$(aws lambda get-function-url-config \
  --function-name $FUNCTION_NAME \
  --region $REGION \
  --query 'FunctionUrl' --output text 2>/dev/null) || {
  aws lambda create-function-url-config \
    --function-name $FUNCTION_NAME \
    --auth-type NONE \
    --cors '{"AllowOrigins":["*"],"AllowMethods":["*"],"AllowHeaders":["Content-Type"]}' \
    --region $REGION >/dev/null

  aws lambda add-permission \
    --function-name $FUNCTION_NAME \
    --statement-id FunctionURLAllowPublicAccess \
    --action lambda:InvokeFunctionUrl \
    --principal "*" \
    --function-url-auth-type NONE \
    --region $REGION >/dev/null 2>&1 || true

  FUNCTION_URL=$(aws lambda get-function-url-config \
    --function-name $FUNCTION_NAME \
    --region $REGION \
    --query 'FunctionUrl' --output text)
}

echo ""
echo "========================================"
echo "  Lambda deployed successfully!"
echo "  Function URL: $FUNCTION_URL"
echo "========================================"
echo ""

# Auto-update lambdaUrl in root config.ts
sed -i "s|lambdaUrl: \".*\"|lambdaUrl: \"$FUNCTION_URL\"|" "../../config.ts"
echo "Updated lambdaUrl in config.ts"

# Clean up
rm -f function.zip
